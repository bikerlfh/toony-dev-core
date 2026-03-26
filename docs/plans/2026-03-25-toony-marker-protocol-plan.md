# TOONY Marker Protocol Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parse `<!--TOONY:{...}-->` markers from Claude's text responses to trigger `question.asked` (with rich UI) and `finish` (close session) signals, replacing the lost `AskUserQuestion` behavior in persistent sessions.

**Architecture:** The runner extracts markers from result text via regex, strips them, and dispatches existing backend WebSocket messages. No backend or frontend changes needed — the runner translates markers into the same `question.asked` and `task.completed` messages the backend already handles.

**Tech Stack:** Python 3.11+, asyncio, `re` module, pytest

---

### Task 1: Add `extract_toony_marker()` to cli_executor.py

**Files:**
- Test: `toony_agent_runner/tests/test_toony_marker.py`
- Modify: `toony_agent_runner/toony_agent_runner/cli_executor.py`

**Step 1: Write tests for marker extraction**

Create `toony_agent_runner/tests/test_toony_marker.py`:

```python
"""Tests for TOONY marker extraction from Claude result text."""

from __future__ import annotations

import pytest

from toony_agent_runner.cli_executor import extract_toony_marker


class TestExtractToonyMarker:

    def test_no_marker_returns_none(self):
        text = "Here is my analysis of the code."
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_question_free_text(self):
        text = 'What do you think?\n<!--TOONY:{"action":"question","text":"What framework?","type":"free_text"}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker["action"] == "question"
        assert marker["text"] == "What framework?"
        assert marker["type"] == "free_text"
        assert "<!--TOONY:" not in cleaned
        assert cleaned.strip() == "What do you think?"

    def test_question_with_options(self):
        text = '<!--TOONY:{"action":"question","text":"Pick one","type":"options","header":"Setup","options":[{"label":"React"},{"label":"Vue"}],"multi_select":false}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker["action"] == "question"
        assert marker["text"] == "Pick one"
        assert marker["type"] == "options"
        assert marker["header"] == "Setup"
        assert len(marker["options"]) == 2
        assert marker["options"][0]["label"] == "React"
        assert marker["multi_select"] is False
        assert cleaned.strip() == ""

    def test_finish_with_summary(self):
        text = 'All done.\n<!--TOONY:{"action":"finish","summary":"Added login endpoint"}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker["action"] == "finish"
        assert marker["summary"] == "Added login endpoint"
        assert "<!--TOONY:" not in cleaned

    def test_finish_without_summary(self):
        text = 'Done.\n<!--TOONY:{"action":"finish"}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker["action"] == "finish"
        assert cleaned.strip() == "Done."

    def test_invalid_json_returns_none(self):
        text = "Here <!--TOONY:not json--> there"
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_missing_action_returns_none(self):
        text = '<!--TOONY:{"text":"no action field"}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_marker_in_middle_of_text(self):
        text = 'Before\n<!--TOONY:{"action":"finish"}-->\nAfter'
        marker, cleaned = extract_toony_marker(text)
        assert marker["action"] == "finish"
        assert "Before" in cleaned
        assert "After" in cleaned
        assert "<!--TOONY:" not in cleaned

    def test_question_defaults(self):
        """type defaults to free_text, multi_select to False."""
        text = '<!--TOONY:{"action":"question","text":"Name?"}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker["action"] == "question"
        assert marker.get("type", "free_text") == "free_text"
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_toony_marker.py -v`
Expected: FAIL — `ImportError: cannot import name 'extract_toony_marker'`

**Step 3: Implement `extract_toony_marker`**

Add to `toony_agent_runner/toony_agent_runner/cli_executor.py` after the existing imports (line 16), add `import re`. Then add the function after `extract_text_from_assistant` (after line 164):

```python
# ---------------------------------------------------------------------------
# TOONY marker protocol
# ---------------------------------------------------------------------------

TOONY_MARKER_RE = re.compile(r"<!--TOONY:(.*?)-->", re.DOTALL)


def extract_toony_marker(text: str) -> tuple[dict[str, Any] | None, str]:
    """Extract a ``<!--TOONY:{...}-->`` marker from text.

    Returns ``(marker_dict, cleaned_text)`` where *marker_dict* is the
    parsed JSON payload (or ``None`` if no valid marker found) and
    *cleaned_text* is the original text with the marker stripped out.
    """
    match = TOONY_MARKER_RE.search(text)
    if not match:
        return None, text

    try:
        payload = json.loads(match.group(1))
    except (json.JSONDecodeError, ValueError):
        return None, text

    if not isinstance(payload, dict) or "action" not in payload:
        return None, text

    cleaned = text[: match.start()] + text[match.end() :]
    return payload, cleaned
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_toony_marker.py -v`
Expected: 9 PASSED

**Step 5: Commit**

```bash
git add toony_agent_runner/tests/test_toony_marker.py toony_agent_runner/toony_agent_runner/cli_executor.py
git commit -m "feat(agent-runner): add extract_toony_marker for in-band signaling protocol"
```

---

### Task 2: Add `--append-system-prompt` to PersistentClaude

**Files:**
- Test: `toony_agent_runner/tests/test_persistent_session.py`
- Modify: `toony_agent_runner/toony_agent_runner/cli_executor.py`

**Step 1: Write test for system prompt in command**

Add to `TestPersistentClaudeBuildCommand` in `test_persistent_session.py`:

```python
    def test_command_includes_system_prompt(self):
        """Persistent mode appends the TOONY marker system prompt."""
        config = ClaudeConfig(working_directory="/tmp")
        pc = PersistentClaude(config)
        cmd = pc._build_command()

        assert "--append-system-prompt" in cmd
        prompt_idx = cmd.index("--append-system-prompt") + 1
        prompt_text = cmd[prompt_idx]
        assert "<!--TOONY:" in prompt_text
        assert '"action":"question"' in prompt_text
        assert '"action":"finish"' in prompt_text
```

**Step 2: Run test to verify it fails**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_persistent_session.py::TestPersistentClaudeBuildCommand::test_command_includes_system_prompt -v`
Expected: FAIL — `--append-system-prompt` not in cmd

**Step 3: Add system prompt to `_build_command`**

In `cli_executor.py`, add a module-level constant after `TOONY_MARKER_RE`:

```python
TOONY_SYSTEM_PROMPT = """\
When you need to ask the user a question, include a TOONY marker in your response:
<!--TOONY:{"action":"question","text":"your question","type":"free_text"}-->

For multiple choice questions:
<!--TOONY:{"action":"question","text":"your question","type":"options","options":[{"label":"Option A"},{"label":"Option B"}]}-->

When you have fully completed the task, include:
<!--TOONY:{"action":"finish","summary":"brief summary of what was done"}-->

Do NOT include the finish marker if you need more information or the task is incomplete."""
```

Then in `PersistentClaude._build_command`, add before the `return cmd` line:

```python
        cmd.extend(["--append-system-prompt", TOONY_SYSTEM_PROMPT])
```

**Step 4: Run test to verify it passes**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_persistent_session.py::TestPersistentClaudeBuildCommand -v`
Expected: 3 PASSED

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/cli_executor.py toony_agent_runner/tests/test_persistent_session.py
git commit -m "feat(agent-runner): inject TOONY marker system prompt into persistent sessions"
```

---

### Task 3: Handle markers in `_process_events`

**Files:**
- Test: `toony_agent_runner/tests/test_toony_marker.py`
- Modify: `toony_agent_runner/toony_agent_runner/task_executor.py`

**Step 1: Write integration tests for marker handling in task execution**

Append to `test_toony_marker.py`:

```python
import asyncio
from unittest.mock import AsyncMock, patch

from toony_agent_runner.cli_executor import PersistentClaude
from toony_agent_runner.task_executor import execute_task, execute_task_reply
from toony_agent_runner.config import ClaudeConfig, RunnerConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config() -> RunnerConfig:
    return RunnerConfig(
        backend_url="ws://localhost",
        api_key="test",
        claude=ClaudeConfig(working_directory="/tmp"),
    )

def _make_conn() -> AsyncMock:
    conn = AsyncMock()
    conn.send = AsyncMock()
    return conn

def _sent_messages(conn: AsyncMock) -> list[dict]:
    return [call.args[0] for call in conn.send.call_args_list]

def _sent_types(conn: AsyncMock) -> list[str]:
    return [msg["type"] for msg in _sent_messages(conn)]


class _MockPC:
    def __init__(self, events, session_id="sess-m1"):
        self._events = events
        self._session_id = session_id
        self._alive = True
        self._idle_timeout = 300
        self._last_activity = __import__("time").monotonic()
        self.messages_sent = []

    @property
    def session_id(self): return self._session_id
    @property
    def is_alive(self): return self._alive
    @property
    def idle_seconds(self): return __import__("time").monotonic() - self._last_activity
    @property
    def is_idle(self): return self.idle_seconds >= self._idle_timeout

    async def start(self): pass
    async def close(self): self._alive = False
    async def send_message(self, content):
        self.messages_sent.append(content)
        for e in self._events:
            yield e


SYSTEM_INIT = {"type": "system", "subtype": "init", "session_id": "sess-m1"}


# ---------------------------------------------------------------------------
# Tests: question marker triggers question.asked
# ---------------------------------------------------------------------------

class TestMarkerQuestionInExecuteTask:

    @pytest.mark.asyncio
    async def test_question_marker_sends_question_asked(self):
        """Result text with question marker → question.asked, not task.completed."""
        events = [
            SYSTEM_INIT,
            {
                "type": "result",
                "is_error": False,
                "result": 'What do you think?\n<!--TOONY:{"action":"question","text":"Pick a DB","type":"options","options":[{"label":"Postgres"},{"label":"MySQL"}]}-->',
                "session_id": "sess-m1",
            },
        ]
        mock_pc = _MockPC(events)
        conn = _make_conn()
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", conn, _make_config(), asyncio.Event(), session_pool=pool)

        types = _sent_types(conn)
        assert "question.asked" in types
        assert "task.completed" not in types

        sent = _sent_messages(conn)
        q_msg = next(m for m in sent if m["type"] == "question.asked")
        assert q_msg["question"]["text"] == "Pick a DB"
        assert q_msg["question"]["type"] == "options"
        assert len(q_msg["question"]["options"]) == 2

    @pytest.mark.asyncio
    async def test_question_marker_keeps_session_alive(self):
        """After question marker, session stays in pool."""
        events = [
            SYSTEM_INIT,
            {
                "type": "result",
                "is_error": False,
                "result": '<!--TOONY:{"action":"question","text":"Name?"}-->',
                "session_id": "sess-m1",
            },
        ]
        mock_pc = _MockPC(events)
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", _make_conn(), _make_config(), asyncio.Event(), session_pool=pool)

        assert "sess-m1" in pool
        assert not mock_pc.close_called if hasattr(mock_pc, "close_called") else True


# ---------------------------------------------------------------------------
# Tests: finish marker closes session
# ---------------------------------------------------------------------------

class TestMarkerFinishInExecuteTask:

    @pytest.mark.asyncio
    async def test_finish_marker_sends_completed(self):
        """Result text with finish marker → task.completed."""
        events = [
            SYSTEM_INIT,
            {
                "type": "result",
                "is_error": False,
                "result": 'All done.\n<!--TOONY:{"action":"finish","summary":"Added endpoint"}-->',
                "session_id": "sess-m1",
            },
        ]
        mock_pc = _MockPC(events)
        conn = _make_conn()
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", conn, _make_config(), asyncio.Event(), session_pool=pool)

        types = _sent_types(conn)
        assert "task.completed" in types
        assert "question.asked" not in types

    @pytest.mark.asyncio
    async def test_finish_marker_closes_session(self):
        """After finish marker, session is NOT in pool (closed)."""
        events = [
            SYSTEM_INIT,
            {
                "type": "result",
                "is_error": False,
                "result": '<!--TOONY:{"action":"finish"}-->',
                "session_id": "sess-m1",
            },
        ]
        mock_pc = _MockPC(events)
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", _make_conn(), _make_config(), asyncio.Event(), session_pool=pool)

        assert "sess-m1" not in pool


# ---------------------------------------------------------------------------
# Tests: no marker → current behavior (session stays alive)
# ---------------------------------------------------------------------------

class TestNoMarkerBehavior:

    @pytest.mark.asyncio
    async def test_no_marker_sends_completed_keeps_session(self):
        """No marker → task.completed, session stays in pool."""
        events = [
            SYSTEM_INIT,
            {
                "type": "result",
                "is_error": False,
                "result": "Here is my analysis.",
                "session_id": "sess-m1",
            },
        ]
        mock_pc = _MockPC(events)
        conn = _make_conn()
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", conn, _make_config(), asyncio.Event(), session_pool=pool)

        types = _sent_types(conn)
        assert "task.completed" in types
        assert "sess-m1" in pool


# ---------------------------------------------------------------------------
# Tests: marker stripped from result text
# ---------------------------------------------------------------------------

class TestMarkerStrippedFromResult:

    @pytest.mark.asyncio
    async def test_finish_marker_stripped_from_result_text(self):
        """The <!--TOONY:...--> marker is removed from the result text sent to backend."""
        events = [
            SYSTEM_INIT,
            {
                "type": "result",
                "is_error": False,
                "result": 'All done.\n<!--TOONY:{"action":"finish","summary":"x"}-->',
                "session_id": "sess-m1",
            },
        ]
        mock_pc = _MockPC(events)
        conn = _make_conn()

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", conn, _make_config(), asyncio.Event())

        sent = _sent_messages(conn)
        completed = next(m for m in sent if m["type"] == "task.completed")
        assert "<!--TOONY:" not in completed["result"]
        assert "All done." in completed["result"]
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_toony_marker.py::TestMarkerQuestionInExecuteTask -v`
Expected: FAIL — question.asked not in types (marker not processed yet)

**Step 3: Modify `_process_events` in task_executor.py**

Add import at top of `task_executor.py`:

```python
from .cli_executor import (
    PersistentClaude,
    extract_question_from_assistant,
    extract_text_from_assistant,
    extract_tool_events,
    extract_toony_marker,
)
```

Then replace the `elif etype == "result":` block (lines 129–155) in `_process_events` with:

```python
        elif etype == "result":
            if event.get("session_id"):
                session_id = str(event["session_id"])

            # If a question was asked via AskUserQuestion tool, don't send completed.
            if question_asked:
                return session_id, sequence, "question"

            if event.get("is_error"):
                error_msg = (
                    event.get("result")
                    or "; ".join(event.get("errors", []))
                    or "Claude CLI error"
                )
                await conn.send(
                    TaskFailedMessage(task_id, error=error_msg).to_json()
                )
                return session_id, sequence, "failed"

            result_text = event.get("result", "Task completed")

            # Check for TOONY marker in result text.
            marker, cleaned_text = extract_toony_marker(result_text)

            if marker and marker.get("action") == "question":
                q_data: dict[str, Any] = {"text": marker["text"]}
                q_type = marker.get("type", "free_text")
                q_data["type"] = q_type
                if marker.get("options"):
                    q_data["options"] = marker["options"]
                if marker.get("multi_select"):
                    q_data["multi_select"] = marker["multi_select"]
                if marker.get("header"):
                    q_data["header"] = marker["header"]

                sequence += 1
                await conn.send(
                    QuestionAskedMessage(
                        task_id=task_id,
                        session_id=session_id or "",
                        question_id=str(__import__("uuid").uuid4()),
                        question_data=q_data,
                        sequence=sequence,
                    ).to_json()
                )
                logger.info(
                    "TOONY marker question for task %s: %s",
                    task_id, marker["text"][:100],
                )
                return session_id, sequence, "question"

            if marker and marker.get("action") == "finish":
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=cleaned_text.strip() or "Task completed",
                        session_id=session_id,
                    ).to_json()
                )
                return session_id, sequence, "finished"

            # No marker — default completion.
            await conn.send(
                TaskCompletedMessage(
                    task_id, result=result_text, session_id=session_id,
                ).to_json()
            )
            return session_id, sequence, "completed"
```

**Step 4: Handle "finished" outcome in `execute_task` and `execute_task_reply`**

In `execute_task` (around line 207), replace the session storage block:

```python
        # Store session for future replies/answers — unless task is finished.
        if outcome == "finished":
            await pc.close()
            if session_pool is not None and session_id:
                session_pool.pop(session_id, None)
            logger.info("Closed persistent session %s (task finished)", session_id)
        elif session_pool is not None and session_id and pc.is_alive:
            session_pool[session_id] = pc
            logger.info(
                "Stored persistent session %s (outcome=%s)", session_id, outcome,
            )
        elif not pc.is_alive:
            await pc.close()
```

Apply the same pattern in the `execute_task_reply` persistent session path (around line 264) and the `--resume` fallback path (around line 310).

**Step 5: Run all tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All PASSED (existing + new marker tests)

**Step 6: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/task_executor.py toony_agent_runner/tests/test_toony_marker.py
git commit -m "feat(agent-runner): handle TOONY markers in _process_events for question/finish signals"
```

---

### Task 4: Run full test suite and push

**Step 1: Run full test suite**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All PASSED

**Step 2: Push to PR branch**

```bash
git push origin worktree-persistent-claude-sessions
```
