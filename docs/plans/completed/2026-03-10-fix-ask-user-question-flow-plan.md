# Fix AskUserQuestion Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 interconnected bugs in the AskUserQuestion flow: raw dict in UI, duplicate question, premature task completion, and broken answer handler.

**Architecture:** The runner detects `AskUserQuestion` tool_use in Claude's stream, sends structured question data to the backend, then returns immediately (no text fallback, no task.completed). When the user answers, the backend sends `question.answered` with `session_id` + `sequence_offset`, and the runner resumes the CLI conversation via `--resume`.

**Tech Stack:** Python 3.11+ (toony_agent_runner), Django Channels (backend consumers), pytest

---

### Task 1: Fix question extraction to parse structured AskUserQuestion input

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/cli_executor.py:86-104`
- Test: `toony_agent_runner/tests/test_cli_executor.py`

**Step 1: Update existing test and add new tests for structured input**

In `toony_agent_runner/tests/test_cli_executor.py`, update `TestExtractQuestionFromAssistant`:

```python
class TestExtractQuestionFromAssistant:
    def test_extracts_structured_questions_format(self):
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {
                            "questions": [
                                {
                                    "question": "What framework?",
                                    "header": "Setup",
                                    "options": [
                                        {"label": "React", "description": "Frontend lib"},
                                        {"label": "Vue", "description": "Alternative"},
                                    ],
                                    "multiSelect": False,
                                }
                            ]
                        },
                    },
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is not None
        assert question["text"] == "What framework?"
        assert question["header"] == "Setup"
        assert len(question["options"]) == 2
        assert question["options"][0]["label"] == "React"
        assert question["multi_select"] is False

    def test_extracts_simple_question_format(self):
        """Backwards compat: old format with top-level 'question' key."""
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {"question": "What framework?"},
                    },
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is not None
        assert question["text"] == "What framework?"
        assert question["header"] is None
        assert question["options"] == []
        assert question["multi_select"] is False

    def test_extracts_structured_without_options(self):
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {
                            "questions": [
                                {"question": "What's your name?"}
                            ]
                        },
                    },
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is not None
        assert question["text"] == "What's your name?"
        assert question["options"] == []

    def test_returns_none_for_no_question(self):
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "tool_use", "name": "Read", "id": "tu1", "input": {}},
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is None
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_cli_executor.py::TestExtractQuestionFromAssistant -v`
Expected: `test_extracts_structured_questions_format` FAILS (missing keys in return dict), `test_extracts_simple_question_format` FAILS (missing keys)

**Step 3: Update `extract_question_from_assistant` implementation**

In `toony_agent_runner/toony_agent_runner/cli_executor.py`, replace lines 86-104:

```python
def extract_question_from_assistant(event: dict[str, Any]) -> dict[str, Any] | None:
    """Extract AskUserQuestion data from an assistant event.

    Handles two input formats:
    - Structured: {"questions": [{"question": "...", "header": "...", "options": [...], "multiSelect": bool}]}
    - Simple: {"question": "..."}

    Returns dict with text, header, options, multi_select, question_id, tool_use_id — or None.
    """
    if event.get("type") != "assistant":
        return None

    message = event.get("message", {})
    for block in message.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "AskUserQuestion":
            tool_input = block.get("input", {})

            # Structured format: {"questions": [{"question": "...", ...}]}
            questions = tool_input.get("questions")
            if isinstance(questions, list) and questions:
                q = questions[0]
                text = q.get("question", "")
                header = q.get("header")
                options = q.get("options", [])
                multi_select = q.get("multiSelect", False)
            else:
                # Simple format fallback: {"question": "..."}
                text = tool_input.get("question", str(tool_input))
                header = None
                options = []
                multi_select = False

            return {
                "text": text,
                "header": header,
                "options": options,
                "multi_select": multi_select,
                "question_id": str(uuid.uuid4()),
                "tool_use_id": block.get("id", ""),
            }
    return None
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_cli_executor.py::TestExtractQuestionFromAssistant -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/cli_executor.py toony_agent_runner/tests/test_cli_executor.py
git commit -m "fix: parse structured AskUserQuestion input format"
```

---

### Task 2: Update QuestionAskedMessage to send structured question data

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py:71-90`
- Test: `toony_agent_runner/tests/test_protocol.py`

**Step 1: Update test for QuestionAskedMessage**

In `toony_agent_runner/tests/test_protocol.py`, replace `TestQuestionAskedMessage`:

```python
class TestQuestionAskedMessage:
    def test_to_json_with_options(self):
        msg = QuestionAskedMessage(
            task_id="task-1",
            session_id="sess-1",
            question_id="q-1",
            question_data={
                "text": "What framework?",
                "type": "options",
                "header": "Setup",
                "options": [{"label": "React", "description": "Frontend lib"}],
                "multi_select": False,
            },
        )
        j = msg.to_json()
        assert j == {
            "type": "question.asked",
            "task_id": "task-1",
            "session_id": "sess-1",
            "question_id": "q-1",
            "question": {
                "text": "What framework?",
                "type": "options",
                "header": "Setup",
                "options": [{"label": "React", "description": "Frontend lib"}],
                "multi_select": False,
            },
        }

    def test_to_json_free_text(self):
        msg = QuestionAskedMessage(
            task_id="task-1",
            session_id="sess-1",
            question_id="q-1",
            question_data={
                "text": "What's your name?",
                "type": "free_text",
            },
        )
        j = msg.to_json()
        assert j["question"]["type"] == "free_text"
        assert j["question"]["text"] == "What's your name?"
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_protocol.py::TestQuestionAskedMessage -v`
Expected: FAIL — `QuestionAskedMessage` still expects `question_text` param

**Step 3: Update QuestionAskedMessage dataclass**

In `toony_agent_runner/toony_agent_runner/protocol.py`, replace lines 71-90:

```python
@dataclass
class QuestionAskedMessage:
    """Signals that Claude is asking the user a question."""

    task_id: str
    session_id: str
    question_id: str
    question_data: dict[str, Any]

    def to_json(self) -> dict:
        return {
            "type": "question.asked",
            "task_id": self.task_id,
            "session_id": self.session_id,
            "question_id": self.question_id,
            "question": self.question_data,
        }
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_protocol.py::TestQuestionAskedMessage -v`
Expected: Both tests PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/protocol.py toony_agent_runner/tests/test_protocol.py
git commit -m "feat: QuestionAskedMessage sends structured question data"
```

---

### Task 3: Add session_id and sequence_offset to QuestionAnswered

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py:141-148` and `parse_server_message` at line 251-256
- Test: `toony_agent_runner/tests/test_protocol.py`

**Step 1: Update test for QuestionAnswered parsing**

In `toony_agent_runner/tests/test_protocol.py`, replace `TestQuestionAnswered`:

```python
class TestQuestionAnswered:
    def test_parse_question_answered(self):
        raw = {
            "type": "question.answered",
            "task_id": "task-1",
            "question_id": "q-1",
            "answer": "React",
            "session_id": "sess-abc",
            "sequence_offset": 5,
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, QuestionAnswered)
        assert msg.task_id == "task-1"
        assert msg.question_id == "q-1"
        assert msg.answer == "React"
        assert msg.session_id == "sess-abc"
        assert msg.sequence_offset == 5

    def test_parse_question_answered_defaults(self):
        raw = {
            "type": "question.answered",
            "task_id": "task-1",
            "question_id": "q-1",
            "answer": "React",
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, QuestionAnswered)
        assert msg.session_id == ""
        assert msg.sequence_offset == 0
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_protocol.py::TestQuestionAnswered -v`
Expected: FAIL — `QuestionAnswered` has no `session_id` attribute

**Step 3: Update QuestionAnswered dataclass and parser**

In `toony_agent_runner/toony_agent_runner/protocol.py`, replace lines 141-148:

```python
@dataclass
class QuestionAnswered:
    """Backend relays a user's answer to a question."""

    task_id: str
    question_id: str
    answer: str
    session_id: str = ""
    sequence_offset: int = 0
```

And update `parse_server_message` at the `question.answered` block (lines 251-256):

```python
    if msg_type == "question.answered":
        return QuestionAnswered(
            task_id=data["task_id"],
            question_id=data["question_id"],
            answer=data.get("answer", ""),
            session_id=data.get("session_id", ""),
            sequence_offset=data.get("sequence_offset", 0),
        )
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_protocol.py::TestQuestionAnswered -v`
Expected: Both tests PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/protocol.py toony_agent_runner/tests/test_protocol.py
git commit -m "feat: add session_id and sequence_offset to QuestionAnswered"
```

---

### Task 4: Stop stream processing after question is detected (task_executor.py)

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/task_executor.py:64-101` (execute_task) and `180-207` (execute_task_reply)

**Step 1: Update execute_task to return after sending question.asked**

In `toony_agent_runner/toony_agent_runner/task_executor.py`, replace the assistant handling block in `execute_task` (lines 64-101):

```python
            if etype == "assistant":
                # Check for AskUserQuestion.
                question = extract_question_from_assistant(event)
                if question:
                    # Build structured question data for the backend.
                    q_data: dict[str, Any] = {"text": question["text"]}
                    if question.get("options"):
                        q_data["type"] = "options"
                        q_data["options"] = question["options"]
                        q_data["multi_select"] = question.get("multi_select", False)
                    else:
                        q_data["type"] = "free_text"
                    if question.get("header"):
                        q_data["header"] = question["header"]

                    await conn.send(
                        QuestionAskedMessage(
                            task_id=task_id,
                            session_id=session_id or "",
                            question_id=question["question_id"],
                            question_data=q_data,
                        ).to_json()
                    )
                    logger.info(
                        "Question asked for task %s: %s",
                        task_id, question["text"][:100],
                    )
                    # Stop processing — task is now WAITING_FOR_ANSWER.
                    # The CLI will continue running (tool denial + fallback text + result)
                    # but we ignore remaining events. The process cleans up via
                    # run_claude's finally block.
                    return

                # Forward tool_use events (excluding AskUserQuestion).
                for tool_event in extract_tool_events(event):
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_TOOL_USE, tool_event, sequence,
                        ).to_json()
                    )

                # Forward text as LOG.
                text = extract_text_from_assistant(event)
                if text:
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_LOG, {"text": text}, sequence,
                        ).to_json()
                    )
```

Also add the `Any` import at the top of the file. Change line 1-6:

```python
"""Task execution via direct Claude CLI invocation."""

from __future__ import annotations

import asyncio
import logging
from typing import Any
```

**Step 2: Apply same change to execute_task_reply**

In `execute_task_reply` (lines 180-207), replace the assistant handling block:

```python
            if etype == "assistant":
                question = extract_question_from_assistant(event)
                if question:
                    q_data: dict[str, Any] = {"text": question["text"]}
                    if question.get("options"):
                        q_data["type"] = "options"
                        q_data["options"] = question["options"]
                        q_data["multi_select"] = question.get("multi_select", False)
                    else:
                        q_data["type"] = "free_text"
                    if question.get("header"):
                        q_data["header"] = question["header"]

                    await conn.send(
                        QuestionAskedMessage(
                            task_id=task_id,
                            session_id=new_session_id or session_id,
                            question_id=question["question_id"],
                            question_data=q_data,
                        ).to_json()
                    )
                    logger.info(
                        "Question asked for task reply %s: %s",
                        task_id, question["text"][:100],
                    )
                    return

                for tool_event in extract_tool_events(event):
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_TOOL_USE, tool_event, sequence,
                        ).to_json()
                    )

                text = extract_text_from_assistant(event)
                if text:
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_LOG, {"text": text}, sequence,
                        ).to_json()
                    )
```

**Step 3: Run all runner tests to check nothing breaks**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/task_executor.py
git commit -m "fix: stop stream processing after AskUserQuestion detected

Return immediately after sending question.asked. Prevents
duplicate question display (text fallback) and premature
task.completed from the CLI's result event."
```

---

### Task 5: Fix QuestionAnswered handler in main.py to spawn execute_task_reply

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/main.py:266-281`

**Step 1: Replace QuestionAnswered handler**

In `toony_agent_runner/toony_agent_runner/main.py`, replace lines 266-281:

```python
            elif isinstance(msg, QuestionAnswered):
                _cleanup_finished_tasks()
                logger.info(
                    "Received question.answered for %s (q=%s, session=%s)",
                    msg.task_id,
                    msg.question_id,
                    msg.session_id,
                )

                if not msg.session_id:
                    logger.warning(
                        "No session_id in question.answered for task %s, ignoring",
                        msg.task_id,
                    )
                    continue

                if msg.task_id in active_tasks:
                    logger.warning(
                        "Task %s still active, ignoring question.answered",
                        msg.task_id,
                    )
                    continue

                if len(active_tasks) >= max_tasks:
                    logger.warning(
                        "At capacity [%d/%d slots], ignoring question.answered %s",
                        len(active_tasks), max_tasks, msg.task_id,
                    )
                    continue

                ce = asyncio.Event()
                cancel_events[msg.task_id] = ce
                active_tasks[msg.task_id] = asyncio.create_task(
                    execute_task_reply(
                        msg.task_id,
                        msg.answer,
                        msg.session_id,
                        conn,
                        config,
                        ce,
                        sequence_offset=msg.sequence_offset,
                    )
                )
```

**Step 2: Run all runner tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/main.py
git commit -m "fix: QuestionAnswered handler spawns execute_task_reply

Replaces broken Futures mechanism. When a user answers a question,
the runner now resumes the CLI conversation via --resume, matching
the TaskReply handler pattern."
```

---

### Task 6: Remove pending_questions from BackendConnection

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/connection.py:60`
- Test: `toony_agent_runner/tests/test_multitask.py` (check for any references)

**Step 1: Check for pending_questions references**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec grep -rn "pending_questions" toony_agent_runner/`
Expected: References in `connection.py:60` and possibly `tests/test_multitask.py`

**Step 2: Remove `pending_questions` from connection.py**

In `toony_agent_runner/toony_agent_runner/connection.py`, delete line 60:

```python
        self.pending_questions: dict[str, asyncio.Future[dict[str, Any]]] = {}
```

Also remove the `asyncio` import if no longer used — but `asyncio` is not imported in connection.py. Check: the line uses `asyncio.Future` which requires the import. Since we're removing the only usage, remove the `asyncio` import from line 13. Keep `json` and `logging`.

Actually, check the imports first — `asyncio` may be used elsewhere in the file. Looking at the file: `asyncio` is only used for `asyncio.Future` on line 60. Remove it.

In `connection.py`, remove:
- Line 13: `import asyncio`
- Line 60: `self.pending_questions: dict[str, asyncio.Future[dict[str, Any]]] = {}`

**Step 3: Update any tests that reference pending_questions**

Check `test_multitask.py` for `pending_questions` references and remove/update them.

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec grep -n "pending_questions" toony_agent_runner/tests/test_multitask.py`

If found, remove those test lines or update accordingly.

**Step 4: Run all runner tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/connection.py toony_agent_runner/tests/
git commit -m "refactor: remove unused pending_questions from BackendConnection"
```

---

### Task 7: Backend — Include session_id and sequence_offset in question.answered broadcast

**Files:**
- Modify: `backend/apps/toony_agents/consumers.py` — lines 531-559 (ToonyAgentConsumer question.answered handler) and lines 446-454 (ToonyAgentRunnerConsumer question_answered group handler)

**Step 1: Add helper to fetch question session_id**

In `backend/apps/toony_agents/consumers.py`, add a new helper function after `_answer_task_question` (around line 182):

```python
@database_sync_to_async
def _get_question_session_id(question_id):
    from toony_agents.models import AgentTaskQuestion

    try:
        return AgentTaskQuestion.objects.values_list(
            "session_id", flat=True,
        ).get(question_id=question_id)
    except AgentTaskQuestion.DoesNotExist:
        return ""
```

**Step 2: Update ToonyAgentConsumer question.answered handler to include session_id and sequence_offset**

In `backend/apps/toony_agents/consumers.py`, replace lines 531-559 in `ToonyAgentConsumer.receive_json`:

```python
        if msg_type == "question.answered":
            task_id = content.get("task_id")
            question_id = content.get("question_id")
            answer = content.get("answer", "")
            if not task_id or not question_id:
                await self.send_json({"type": "error", "message": "task_id and question_id are required"})
                return
            if not await _validate_task_org_member(task_id, self.user):
                await self.send_json({"type": "error", "message": "Task not found"})
                return
            await _answer_task_question(question_id, answer)
            await _create_task_event(
                task_id,
                TaskEventType.QUESTION_ANSWERED,
                {"question_id": question_id, "answer": answer},
                content.get("sequence", 0),
            )
            await _update_task_status(task_id, AgentTaskStatus.RUNNING)
            # Fetch session_id and sequence_offset for the runner to resume.
            session_id = await _get_question_session_id(question_id)
            max_seq = await _get_max_event_sequence(task_id)
            await self.channel_layer.group_send(
                runner_group,
                {
                    "type": "question_answered",
                    "data": {
                        "task_id": task_id,
                        "question_id": question_id,
                        "answer": answer,
                        "session_id": session_id,
                        "sequence_offset": max_seq + 1,
                    },
                },
            )
```

**Step 3: Update ToonyAgentRunnerConsumer.question_answered group handler to forward new fields**

In `backend/apps/toony_agents/consumers.py`, replace lines 446-454:

```python
    async def question_answered(self, event):
        await self.send_json(
            {
                "type": "question.answered",
                "task_id": event["data"]["task_id"],
                "question_id": event["data"]["question_id"],
                "answer": event["data"]["answer"],
                "session_id": event["data"].get("session_id", ""),
                "sequence_offset": event["data"].get("sequence_offset", 0),
            }
        )
```

**Step 4: Run backend tests**

Run: `docker compose exec backend pytest tests/ -v -k "toony_agent or consumer"` (or full suite if no specific consumer tests exist)
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/apps/toony_agents/consumers.py
git commit -m "feat: include session_id and sequence_offset in question.answered broadcast

Fetches session_id from AgentTaskQuestion and computes sequence_offset
from max TaskEvent sequence, so the runner can resume the CLI conversation."
```

---

### Task 8: Backend — Include structured question data in question_asked broadcast to frontend

**Files:**
- Modify: `backend/apps/toony_agents/consumers.py` — lines 319-361 (runner's question.asked handler) and lines 163-172 (_create_task_question)

**Step 1: Update runner consumer to store and forward structured question data**

In `backend/apps/toony_agents/consumers.py`, replace the `question.asked` handler (lines 319-361):

```python
        elif msg_type == "question.asked":
            task_id = content.get("task_id")
            if not task_id:
                await self.send_json({"type": "error", "message": "task_id is required"})
                return
            if not await _validate_task_ownership(task_id, self.agent_id):
                await self.send_json({"type": "error", "message": "Task not found for this agent"})
                return
            question_id = content.get("question_id", "")
            question = content.get("question", {})
            session_id = content.get("session_id", "")
            question_text = question.get("text", "") if isinstance(question, dict) else str(question)
            sequence = content.get("sequence", 0)

            await _update_task_status(
                task_id,
                AgentTaskStatus.WAITING_FOR_ANSWER,
                toony_agent_id=self.agent_id,
            )
            await _create_task_question(
                task_id,
                question_id,
                question_text,
                session_id,
            )
            await _create_task_event(
                task_id,
                TaskEventType.QUESTION_ASKED,
                {"question_id": question_id, "text": question_text},
                sequence,
            )
            # Forward structured question data to frontend.
            frontend_question_data = {"task_id": task_id, "question_id": question_id, "sequence": sequence}
            if isinstance(question, dict):
                frontend_question_data["question"] = question
            else:
                frontend_question_data["question"] = {"text": question_text, "type": "free_text"}
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "question_asked",
                    "data": frontend_question_data,
                },
            )
```

**Step 2: Run backend tests**

Run: `docker compose exec backend pytest tests/ -v -k "toony_agent or consumer"`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/apps/toony_agents/consumers.py
git commit -m "feat: forward structured question data (header, options) to frontend

The question_asked broadcast now includes the full question dict
(type, header, options, multi_select) so the frontend can render
rich question UI with option buttons."
```

---

### Task 9: Run full test suite and verify

**Step 1: Run all runner tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All tests PASS

**Step 2: Run backend tests**

Run: `make test`
Expected: All tests PASS

**Step 3: Run backend lint**

Run: `make lint`
Expected: No errors

**Step 4: Final commit if any remaining changes**

If clean, no commit needed. Otherwise fix and commit.
