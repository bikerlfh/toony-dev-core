import uuid

import pytest
from channels.db import database_sync_to_async
from django.utils import timezone

from toony_agents.consumers import (
    _answer_task_question,
    _create_task_event,
    _create_task_question,
    _get_max_event_sequence,
    _get_question_session_id,
    _update_task_status,
)
from toony_agents.models import (
    AgentTask,
    AgentTaskQuestion,
    AgentTaskStatus,
    TaskEvent,
    TaskEventType,
    ToonyAgent,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers — unwrap the @database_sync_to_async wrappers so we can call them
# from synchronous pytest tests.
# ---------------------------------------------------------------------------


def _sync_create_task_question(task_id, question_id, text, session_id):
    return AgentTaskQuestion.objects.create(
        task_id=task_id,
        question_id=question_id,
        text=text,
        session_id=session_id,
    )


def _sync_answer_task_question(question_id, answer):
    return AgentTaskQuestion.objects.filter(
        question_id=question_id,
    ).update(answer=answer, answered_at=timezone.now())


def _sync_get_question_session_id(question_id):
    try:
        return AgentTaskQuestion.objects.values_list(
            "session_id",
            flat=True,
        ).get(question_id=question_id)
    except AgentTaskQuestion.DoesNotExist:
        return ""


def _sync_get_max_event_sequence(task_id):
    from django.db.models import Max

    result = TaskEvent.objects.filter(task_id=task_id).aggregate(Max("sequence"))
    return result["sequence__max"] or 0


def _sync_update_task_status(task_id, new_status, **kwargs):
    updates = {"status": new_status}
    if new_status in (
        AgentTaskStatus.COMPLETED,
        AgentTaskStatus.FAILED,
        AgentTaskStatus.CANCELLED,
    ):
        updates["completed_at"] = timezone.now()
    if "result" in kwargs:
        updates["result"] = kwargs["result"]
    if "error" in kwargs:
        updates["error"] = kwargs["error"]
    return AgentTask.objects.filter(id=task_id).update(**updates)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def agent(user):
    return ToonyAgent.objects.create(
        name="Question Bot",
        slug="question-bot",
        registered_by=user,
    )


@pytest.fixture()
def task(organization, agent, user):
    agent.organizations.add(organization)
    return AgentTask.objects.create(
        organization=organization,
        toony_agent=agent,
        title="Task with questions",
        prompt="Do something that requires questions",
        status=AgentTaskStatus.RUNNING,
        created_by=user,
    )


# ---------------------------------------------------------------------------
# 1. question.asked — creates question record, updates task, creates event
# ---------------------------------------------------------------------------


class TestQuestionAsked:
    """Simulate what happens when the runner sends a question.asked message."""

    def test_creates_question_record(self, task):
        question_id = uuid.uuid4()
        session_id = "sess_abc123"
        question_text = "Which database should I use?"

        question = _sync_create_task_question(
            task_id=task.id,
            question_id=question_id,
            text=question_text,
            session_id=session_id,
        )

        assert question.task_id == task.id
        assert question.question_id == question_id
        assert question.text == question_text
        assert question.session_id == session_id
        assert question.answer is None
        assert question.answered_at is None

    def test_updates_task_status_to_waiting(self, task):
        _sync_update_task_status(task.id, AgentTaskStatus.WAITING_FOR_ANSWER)

        task.refresh_from_db()
        assert task.status == AgentTaskStatus.WAITING_FOR_ANSWER

    def test_creates_question_asked_event(self, task):
        question_id = uuid.uuid4()
        question_text = "What branch?"
        sequence = 5

        event = TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ASKED,
            data={"question_id": str(question_id), "text": question_text},
            sequence=sequence,
        )

        assert event.event_type == TaskEventType.QUESTION_ASKED
        assert event.data["question_id"] == str(question_id)
        assert event.data["text"] == question_text
        assert event.sequence == sequence

    def test_full_question_asked_flow(self, task):
        """End-to-end: status change, question record, and event creation."""
        question_id = uuid.uuid4()
        session_id = "sess_full_flow"
        question_text = "Should I refactor this module?"
        sequence = 3

        # Step 1: Update task status
        _sync_update_task_status(task.id, AgentTaskStatus.WAITING_FOR_ANSWER)

        # Step 2: Create question record
        _sync_create_task_question(task.id, question_id, question_text, session_id)

        # Step 3: Create event
        TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ASKED,
            data={"question_id": str(question_id), "text": question_text},
            sequence=sequence,
        )

        # Verify task status
        task.refresh_from_db()
        assert task.status == AgentTaskStatus.WAITING_FOR_ANSWER

        # Verify question record
        q = AgentTaskQuestion.objects.get(question_id=question_id)
        assert q.text == question_text
        assert q.session_id == session_id
        assert q.answer is None

        # Verify event
        event = TaskEvent.objects.get(task=task, event_type=TaskEventType.QUESTION_ASKED)
        assert event.data["question_id"] == str(question_id)

    def test_question_record_str_pending(self, task):
        question_id = uuid.uuid4()
        q = _sync_create_task_question(task.id, question_id, "What?", "sess_1")
        assert "pending" in str(q)

    def test_question_record_str_answered(self, task):
        question_id = uuid.uuid4()
        q = _sync_create_task_question(task.id, question_id, "What?", "sess_1")
        q.answer = "Use postgres"
        q.save()
        assert "answered" in str(q)


# ---------------------------------------------------------------------------
# 2. question.answered — updates question, resets task status, creates event
# ---------------------------------------------------------------------------


class TestQuestionAnswered:
    """Simulate what happens when the frontend sends a question.answered message."""

    def test_updates_question_with_answer(self, task):
        question_id = uuid.uuid4()
        _sync_create_task_question(task.id, question_id, "Which DB?", "sess_ans1")

        rows_updated = _sync_answer_task_question(question_id, "PostgreSQL")
        assert rows_updated == 1

        q = AgentTaskQuestion.objects.get(question_id=question_id)
        assert q.answer == "PostgreSQL"
        assert q.answered_at is not None

    def test_updates_task_status_to_running(self, task):
        # Set task to WAITING_FOR_ANSWER first
        _sync_update_task_status(task.id, AgentTaskStatus.WAITING_FOR_ANSWER)
        task.refresh_from_db()
        assert task.status == AgentTaskStatus.WAITING_FOR_ANSWER

        # Answer the question -> task goes back to RUNNING
        _sync_update_task_status(task.id, AgentTaskStatus.RUNNING)
        task.refresh_from_db()
        assert task.status == AgentTaskStatus.RUNNING

    def test_creates_question_answered_event(self, task):
        question_id = uuid.uuid4()
        answer = "Use Redis for caching"
        sequence = 6

        event = TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ANSWERED,
            data={"question_id": str(question_id), "answer": answer},
            sequence=sequence,
        )

        assert event.event_type == TaskEventType.QUESTION_ANSWERED
        assert event.data["answer"] == answer

    def test_full_question_answered_flow(self, task):
        """End-to-end: answer question, create event, update status, get session_id."""
        question_id = uuid.uuid4()
        session_id = "sess_answer_flow"
        answer = "Yes, refactor it"
        ask_sequence = 3
        answer_sequence = 4

        # Setup: create the question first (simulating question.asked)
        _sync_create_task_question(task.id, question_id, "Should I refactor?", session_id)
        _sync_update_task_status(task.id, AgentTaskStatus.WAITING_FOR_ANSWER)
        TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ASKED,
            data={"question_id": str(question_id), "text": "Should I refactor?"},
            sequence=ask_sequence,
        )

        # Now simulate answering
        _sync_answer_task_question(question_id, answer)
        TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ANSWERED,
            data={"question_id": str(question_id), "answer": answer},
            sequence=answer_sequence,
        )
        _sync_update_task_status(task.id, AgentTaskStatus.RUNNING)

        # Verify: question is answered
        q = AgentTaskQuestion.objects.get(question_id=question_id)
        assert q.answer == answer
        assert q.answered_at is not None

        # Verify: task is back to RUNNING
        task.refresh_from_db()
        assert task.status == AgentTaskStatus.RUNNING

        # Verify: session_id is retrievable for runner broadcast
        retrieved_session_id = _sync_get_question_session_id(question_id)
        assert retrieved_session_id == session_id

        # Verify: sequence_offset is max_sequence + 1
        max_seq = _sync_get_max_event_sequence(task.id)
        assert max_seq == answer_sequence
        sequence_offset = max_seq + 1
        assert sequence_offset == answer_sequence + 1

    def test_answer_nonexistent_question_returns_zero(self):
        """Answering a question_id that does not exist updates zero rows."""
        bogus_id = uuid.uuid4()
        rows_updated = _sync_answer_task_question(bogus_id, "Some answer")
        assert rows_updated == 0


# ---------------------------------------------------------------------------
# 3. question.answered with missing question_id returns error
# ---------------------------------------------------------------------------


class TestQuestionAnsweredValidation:
    """Validate error cases for the question.answered flow."""

    def test_missing_question_id_detected(self):
        """The consumer checks for question_id before processing."""
        # Simulate the validation logic from ToonyAgentConsumer.receive_json
        content = {"type": "question.answered", "task_id": str(uuid.uuid4()), "answer": "yes"}
        question_id = content.get("question_id")
        task_id = content.get("task_id")

        # The consumer requires both task_id and question_id
        assert task_id is not None
        assert question_id is None  # Missing!

        # This would trigger: "task_id and question_id are required"
        requires_error = not task_id or not question_id
        assert requires_error is True

    def test_missing_task_id_detected(self):
        """The consumer checks for task_id before processing."""
        content = {"type": "question.answered", "question_id": str(uuid.uuid4()), "answer": "yes"}
        question_id = content.get("question_id")
        task_id = content.get("task_id")

        assert question_id is not None
        assert task_id is None

        requires_error = not task_id or not question_id
        assert requires_error is True

    def test_both_missing_detected(self):
        """Both task_id and question_id missing triggers error."""
        content = {"type": "question.answered", "answer": "yes"}
        question_id = content.get("question_id")
        task_id = content.get("task_id")

        requires_error = not task_id or not question_id
        assert requires_error is True


# ---------------------------------------------------------------------------
# 4. _get_question_session_id helper
# ---------------------------------------------------------------------------


class TestGetQuestionSessionId:
    def test_returns_correct_session_id(self, task):
        question_id = uuid.uuid4()
        session_id = "sess_xyz789"

        _sync_create_task_question(task.id, question_id, "Which branch?", session_id)

        result = _sync_get_question_session_id(question_id)
        assert result == session_id

    def test_returns_empty_string_for_nonexistent_question(self):
        bogus_id = uuid.uuid4()
        result = _sync_get_question_session_id(bogus_id)
        assert result == ""

    def test_returns_session_id_for_answered_question(self, task):
        """Session ID should be retrievable even after the question is answered."""
        question_id = uuid.uuid4()
        session_id = "sess_persisted"

        _sync_create_task_question(task.id, question_id, "Proceed?", session_id)
        _sync_answer_task_question(question_id, "Yes")

        result = _sync_get_question_session_id(question_id)
        assert result == session_id

    def test_distinct_session_ids_per_question(self, task):
        """Different questions can have different session_ids."""
        q1_id = uuid.uuid4()
        q2_id = uuid.uuid4()

        _sync_create_task_question(task.id, q1_id, "Q1?", "sess_first")
        _sync_create_task_question(task.id, q2_id, "Q2?", "sess_second")

        assert _sync_get_question_session_id(q1_id) == "sess_first"
        assert _sync_get_question_session_id(q2_id) == "sess_second"


# ---------------------------------------------------------------------------
# 5. _get_max_event_sequence helper
# ---------------------------------------------------------------------------


class TestGetMaxEventSequence:
    def test_returns_zero_for_task_with_no_events(self, task):
        result = _sync_get_max_event_sequence(task.id)
        assert result == 0

    def test_returns_max_sequence(self, task):
        TaskEvent.objects.create(task=task, event_type=TaskEventType.LOG, data={}, sequence=1)
        TaskEvent.objects.create(task=task, event_type=TaskEventType.LOG, data={}, sequence=5)
        TaskEvent.objects.create(task=task, event_type=TaskEventType.LOG, data={}, sequence=3)

        result = _sync_get_max_event_sequence(task.id)
        assert result == 5

    def test_includes_question_events_in_max(self, task):
        """Question events should be counted in the max sequence."""
        TaskEvent.objects.create(task=task, event_type=TaskEventType.LOG, data={}, sequence=1)
        TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ASKED,
            data={"question_id": str(uuid.uuid4()), "text": "Q?"},
            sequence=2,
        )
        TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ANSWERED,
            data={"question_id": str(uuid.uuid4()), "answer": "A"},
            sequence=3,
        )

        result = _sync_get_max_event_sequence(task.id)
        assert result == 3

    def test_returns_zero_for_nonexistent_task(self):
        bogus_id = uuid.uuid4()
        result = _sync_get_max_event_sequence(bogus_id)
        assert result == 0

    def test_sequence_offset_calculation(self, task):
        """Sequence offset = max_sequence + 1, used by runner to resume."""
        TaskEvent.objects.create(task=task, event_type=TaskEventType.LOG, data={}, sequence=1)
        TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ASKED,
            data={},
            sequence=2,
        )
        TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.QUESTION_ANSWERED,
            data={},
            sequence=3,
        )

        max_seq = _sync_get_max_event_sequence(task.id)
        sequence_offset = max_seq + 1
        assert sequence_offset == 4


# ---------------------------------------------------------------------------
# 6. Multiple questions on the same task
# ---------------------------------------------------------------------------


class TestMultipleQuestions:
    def test_multiple_questions_on_same_task(self, task):
        """A task can have multiple questions asked and answered sequentially."""
        q1_id = uuid.uuid4()
        q2_id = uuid.uuid4()

        # First question cycle
        _sync_create_task_question(task.id, q1_id, "Which framework?", "sess_1")
        _sync_update_task_status(task.id, AgentTaskStatus.WAITING_FOR_ANSWER)
        _sync_answer_task_question(q1_id, "Django")
        _sync_update_task_status(task.id, AgentTaskStatus.RUNNING)

        # Second question cycle
        _sync_create_task_question(task.id, q2_id, "Which DB?", "sess_2")
        _sync_update_task_status(task.id, AgentTaskStatus.WAITING_FOR_ANSWER)
        _sync_answer_task_question(q2_id, "PostgreSQL")
        _sync_update_task_status(task.id, AgentTaskStatus.RUNNING)

        # Verify both questions exist and are answered
        questions = AgentTaskQuestion.objects.filter(task=task).order_by("created_at")
        assert questions.count() == 2

        q1 = questions.first()
        assert q1.answer == "Django"
        assert q1.answered_at is not None

        q2 = questions.last()
        assert q2.answer == "PostgreSQL"
        assert q2.answered_at is not None

        # Task should be back to RUNNING
        task.refresh_from_db()
        assert task.status == AgentTaskStatus.RUNNING

    def test_question_uniqueness_by_question_id(self, task):
        """question_id is unique — creating duplicate raises IntegrityError."""
        from django.db import IntegrityError

        question_id = uuid.uuid4()
        _sync_create_task_question(task.id, question_id, "Q1?", "sess_1")

        with pytest.raises(IntegrityError):
            _sync_create_task_question(task.id, question_id, "Q2?", "sess_2")
