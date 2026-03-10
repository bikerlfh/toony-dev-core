# tests/test_question_flow.py
"""Tests for the AskUserQuestion flow in task_executor.

Validates that:
- execute_task stops processing after detecting AskUserQuestion
- execute_task_reply stops processing after detecting a chained question
- Normal flow without questions sends task.completed
- Structured question data is forwarded correctly
"""

from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch

from toony_agent_runner.task_executor import execute_task, execute_task_reply
from toony_agent_runner.config import ClaudeConfig, RunnerConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config() -> RunnerConfig:
    """Create a minimal RunnerConfig for testing."""
    return RunnerConfig(
        backend_url="ws://localhost",
        api_key="test",
        claude=ClaudeConfig(working_directory="/tmp"),
    )


def _make_conn() -> AsyncMock:
    """Create a mock BackendConnection with an async send method."""
    conn = AsyncMock()
    conn.send = AsyncMock()
    return conn


def _sent_messages(conn: AsyncMock) -> list[dict]:
    """Extract all dicts passed to conn.send(...)."""
    return [call.args[0] for call in conn.send.call_args_list]


def _sent_types(conn: AsyncMock) -> list[str]:
    """Extract the 'type' field from every message sent via conn.send(...)."""
    return [msg["type"] for msg in _sent_messages(conn)]


# ---------------------------------------------------------------------------
# Event fixtures
# ---------------------------------------------------------------------------

SYSTEM_INIT = {
    "type": "system",
    "subtype": "init",
    "session_id": "sess-123",
}

ASK_USER_QUESTION_STRUCTURED = {
    "type": "assistant",
    "message": {
        "content": [{
            "type": "tool_use",
            "name": "AskUserQuestion",
            "id": "tu1",
            "input": {
                "questions": [{
                    "question": "What framework?",
                    "header": "Setup",
                    "options": [
                        {"label": "React", "description": "Frontend library"},
                        {"label": "Vue", "description": "Alternative"},
                    ],
                    "multiSelect": False,
                }]
            },
        }],
    },
    "session_id": "sess-123",
}

ASK_USER_QUESTION_FREE_TEXT = {
    "type": "assistant",
    "message": {
        "content": [{
            "type": "tool_use",
            "name": "AskUserQuestion",
            "id": "tu2",
            "input": {
                "questions": [{
                    "question": "What is your project name?",
                }]
            },
        }],
    },
    "session_id": "sess-123",
}

FALLBACK_TEXT = {
    "type": "assistant",
    "message": {
        "content": [{"type": "text", "text": "Fallback text after denial"}],
    },
    "session_id": "sess-123",
}

TOOL_USE_READ = {
    "type": "assistant",
    "message": {
        "content": [{
            "type": "tool_use",
            "name": "Read",
            "id": "tu3",
            "input": {"file_path": "/tmp/test.py"},
        }],
    },
    "session_id": "sess-123",
}

TEXT_EVENT = {
    "type": "assistant",
    "message": {
        "content": [{"type": "text", "text": "Here is my analysis."}],
    },
    "session_id": "sess-123",
}

RESULT_SUCCESS = {
    "type": "result",
    "subtype": "success",
    "is_error": False,
    "result": "Done",
    "session_id": "sess-123",
}

RESULT_ERROR = {
    "type": "result",
    "subtype": "error",
    "is_error": True,
    "result": "Something broke",
    "session_id": "sess-123",
}


# ---------------------------------------------------------------------------
# Test 4: execute_task stops after question
# ---------------------------------------------------------------------------

class TestExecuteTaskStopsAfterQuestion:
    """After detecting AskUserQuestion, execute_task sends question.asked
    and returns without sending task.completed or forwarding later events."""

    @pytest.mark.asyncio
    async def test_sends_question_asked_and_stops(self):
        """Core test: question.asked is sent, task.completed is NOT sent."""
        events = [
            SYSTEM_INIT,
            ASK_USER_QUESTION_STRUCTURED,
            FALLBACK_TEXT,       # should NOT be forwarded
            RESULT_SUCCESS,      # should NOT trigger task.completed
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        types = _sent_types(conn)

        assert "task.accepted" in types
        assert "question.asked" in types
        assert "task.completed" not in types
        assert "task.failed" not in types

    @pytest.mark.asyncio
    async def test_no_log_events_after_question(self):
        """No task.event with LOG type should appear after the question."""
        events = [
            SYSTEM_INIT,
            ASK_USER_QUESTION_STRUCTURED,
            FALLBACK_TEXT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        sent = _sent_messages(conn)
        log_events = [
            msg for msg in sent
            if msg.get("type") == "task.event" and msg.get("event_type") == "LOG"
        ]
        assert log_events == []

    @pytest.mark.asyncio
    async def test_question_asked_has_structured_data(self):
        """Verify question.asked message contains structured question data."""
        events = [
            SYSTEM_INIT,
            ASK_USER_QUESTION_STRUCTURED,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        sent = _sent_messages(conn)
        question_msg = next(msg for msg in sent if msg["type"] == "question.asked")

        assert question_msg["session_id"] == "sess-123"
        assert question_msg["question"]["text"] == "What framework?"
        assert question_msg["question"]["type"] == "options"
        assert question_msg["question"]["header"] == "Setup"
        assert len(question_msg["question"]["options"]) == 2
        assert question_msg["question"]["options"][0]["label"] == "React"
        assert question_msg["question"]["multi_select"] is False
        assert "question_id" in question_msg

    @pytest.mark.asyncio
    async def test_question_asked_free_text(self):
        """When question has no options, type should be 'free_text'."""
        events = [
            SYSTEM_INIT,
            ASK_USER_QUESTION_FREE_TEXT,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        sent = _sent_messages(conn)
        question_msg = next(msg for msg in sent if msg["type"] == "question.asked")

        assert question_msg["question"]["text"] == "What is your project name?"
        assert question_msg["question"]["type"] == "free_text"

    @pytest.mark.asyncio
    async def test_events_before_question_are_forwarded(self):
        """Tool events that appear BEFORE AskUserQuestion should be forwarded normally."""
        events = [
            SYSTEM_INIT,
            TOOL_USE_READ,
            TEXT_EVENT,
            ASK_USER_QUESTION_STRUCTURED,
            FALLBACK_TEXT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        sent = _sent_messages(conn)
        types = _sent_types(conn)

        # task.accepted + tool_use event + log event + question.asked = 4 messages
        assert types.count("task.accepted") == 1
        assert types.count("task.event") == 2  # one TOOL_USE, one LOG
        assert types.count("question.asked") == 1
        assert "task.completed" not in types

        # Verify the TOOL_USE event was forwarded
        tool_events = [
            msg for msg in sent
            if msg.get("type") == "task.event" and msg.get("event_type") == "TOOL_USE"
        ]
        assert len(tool_events) == 1
        assert tool_events[0]["data"]["tool_name"] == "Read"

        # Verify the LOG event before the question was forwarded
        log_events = [
            msg for msg in sent
            if msg.get("type") == "task.event" and msg.get("event_type") == "LOG"
        ]
        assert len(log_events) == 1
        assert log_events[0]["data"]["text"] == "Here is my analysis."


# ---------------------------------------------------------------------------
# Test 5: execute_task_reply also stops after question
# ---------------------------------------------------------------------------

class TestExecuteTaskReplyStopsAfterQuestion:
    """execute_task_reply should also stop after detecting AskUserQuestion,
    mirroring the behavior of execute_task."""

    @pytest.mark.asyncio
    async def test_reply_sends_question_asked_and_stops(self):
        """After detecting AskUserQuestion in a reply, sends question.asked
        and does NOT send task.completed."""
        events = [
            SYSTEM_INIT,
            ASK_USER_QUESTION_STRUCTURED,
            FALLBACK_TEXT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task_reply(
                "task-1", "React", "sess-original",
                conn, config, cancel_event,
                sequence_offset=5,
            )

        types = _sent_types(conn)

        # execute_task_reply does NOT send task.accepted
        assert "task.accepted" not in types
        assert "question.asked" in types
        assert "task.completed" not in types
        assert "task.failed" not in types

    @pytest.mark.asyncio
    async def test_reply_no_log_after_question(self):
        """No LOG events should be forwarded after the question in a reply."""
        events = [
            SYSTEM_INIT,
            ASK_USER_QUESTION_STRUCTURED,
            FALLBACK_TEXT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task_reply(
                "task-1", "React", "sess-original",
                conn, config, cancel_event,
                sequence_offset=5,
            )

        sent = _sent_messages(conn)
        log_events = [
            msg for msg in sent
            if msg.get("type") == "task.event" and msg.get("event_type") == "LOG"
        ]
        assert log_events == []

    @pytest.mark.asyncio
    async def test_reply_uses_session_id_from_stream(self):
        """question.asked should use the session_id from the event stream,
        falling back to the original session_id passed in."""
        events = [
            SYSTEM_INIT,  # has session_id "sess-123"
            ASK_USER_QUESTION_STRUCTURED,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task_reply(
                "task-1", "React", "sess-original",
                conn, config, cancel_event,
            )

        sent = _sent_messages(conn)
        question_msg = next(msg for msg in sent if msg["type"] == "question.asked")
        # The new session_id from the stream should be used
        assert question_msg["session_id"] == "sess-123"

    @pytest.mark.asyncio
    async def test_reply_falls_back_to_original_session_id(self):
        """When the event stream provides no session_id, the original one is used."""
        events_no_session = [
            {"type": "system", "subtype": "init"},  # no session_id
            {
                "type": "assistant",
                "message": {
                    "content": [{
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {
                            "questions": [{"question": "Which DB?"}]
                        },
                    }],
                },
            },
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events_no_session:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task_reply(
                "task-1", "answer", "sess-original",
                conn, config, cancel_event,
            )

        sent = _sent_messages(conn)
        question_msg = next(msg for msg in sent if msg["type"] == "question.asked")
        assert question_msg["session_id"] == "sess-original"

    @pytest.mark.asyncio
    async def test_reply_sequence_continues_from_offset(self):
        """Events before the question should use sequence numbers starting
        from the provided sequence_offset."""
        events = [
            SYSTEM_INIT,
            TOOL_USE_READ,
            TEXT_EVENT,
            ASK_USER_QUESTION_STRUCTURED,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task_reply(
                "task-1", "React", "sess-original",
                conn, config, cancel_event,
                sequence_offset=10,
            )

        sent = _sent_messages(conn)
        task_events = [msg for msg in sent if msg.get("type") == "task.event"]
        assert len(task_events) == 2
        assert task_events[0]["sequence"] == 11  # 10 + 1
        assert task_events[1]["sequence"] == 12  # 10 + 2


# ---------------------------------------------------------------------------
# Test 6: Normal flow without questions sends task.completed
# ---------------------------------------------------------------------------

class TestNormalFlowSendsTaskCompleted:
    """When there is no AskUserQuestion, execute_task processes all events
    normally and sends task.completed at the end."""

    @pytest.mark.asyncio
    async def test_normal_flow_sends_completed(self):
        """Full flow: system init, tool use, text, result -> task.completed."""
        events = [
            SYSTEM_INIT,
            TOOL_USE_READ,
            TEXT_EVENT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        types = _sent_types(conn)

        assert "task.accepted" in types
        assert "task.completed" in types
        assert "question.asked" not in types

    @pytest.mark.asyncio
    async def test_normal_flow_forwards_all_events(self):
        """All tool_use and text events are forwarded as task.event messages."""
        events = [
            SYSTEM_INIT,
            TOOL_USE_READ,
            TEXT_EVENT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        sent = _sent_messages(conn)

        tool_events = [
            msg for msg in sent
            if msg.get("type") == "task.event" and msg.get("event_type") == "TOOL_USE"
        ]
        log_events = [
            msg for msg in sent
            if msg.get("type") == "task.event" and msg.get("event_type") == "LOG"
        ]
        assert len(tool_events) == 1
        assert len(log_events) == 1

    @pytest.mark.asyncio
    async def test_normal_flow_completed_has_session_id(self):
        """task.completed message should include the session_id."""
        events = [
            SYSTEM_INIT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        sent = _sent_messages(conn)
        completed = next(msg for msg in sent if msg["type"] == "task.completed")
        assert completed["session_id"] == "sess-123"
        assert completed["result"] == "Done"

    @pytest.mark.asyncio
    async def test_normal_flow_sequences_increment(self):
        """Sequence numbers should increment from 1 for each task.event."""
        events = [
            SYSTEM_INIT,
            TOOL_USE_READ,
            TEXT_EVENT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        sent = _sent_messages(conn)
        task_events = [msg for msg in sent if msg.get("type") == "task.event"]
        sequences = [msg["sequence"] for msg in task_events]
        assert sequences == [1, 2]

    @pytest.mark.asyncio
    async def test_error_result_sends_task_failed(self):
        """An error result should send task.failed instead of task.completed."""
        events = [
            SYSTEM_INIT,
            RESULT_ERROR,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        types = _sent_types(conn)
        assert "task.failed" in types
        assert "task.completed" not in types

        sent = _sent_messages(conn)
        failed = next(msg for msg in sent if msg["type"] == "task.failed")
        assert failed["error"] == "Something broke"

    @pytest.mark.asyncio
    async def test_reply_normal_flow_sends_completed(self):
        """execute_task_reply with normal events (no question) sends task.completed."""
        events = [
            SYSTEM_INIT,
            TEXT_EVENT,
            RESULT_SUCCESS,
        ]

        async def mock_run_claude(*args, **kwargs):
            for event in events:
                yield event

        conn = _make_conn()
        cancel_event = asyncio.Event()
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task_reply(
                "task-1", "Continue", "sess-original",
                conn, config, cancel_event,
                sequence_offset=3,
            )

        types = _sent_types(conn)
        assert "task.completed" in types
        assert "question.asked" not in types
        # execute_task_reply does not send task.accepted
        assert "task.accepted" not in types

    @pytest.mark.asyncio
    async def test_cancel_event_stops_execution(self):
        """Setting the cancel_event should abort processing and send task.failed."""
        events_seen = []

        async def mock_run_claude(*args, **kwargs):
            yield SYSTEM_INIT
            yield TOOL_USE_READ
            # Simulate: after first tool event, cancel is set
            yield TEXT_EVENT
            yield RESULT_SUCCESS

        conn = _make_conn()
        cancel_event = asyncio.Event()
        cancel_event.set()  # pre-set: cancellation is immediate
        config = _make_config()

        with patch(
            "toony_agent_runner.task_executor.run_claude",
            side_effect=mock_run_claude,
        ):
            await execute_task("task-1", "test prompt", conn, config, cancel_event)

        types = _sent_types(conn)
        assert "task.accepted" in types
        assert "task.failed" in types
        assert "task.completed" not in types
