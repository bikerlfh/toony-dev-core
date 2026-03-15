# CLI Executor + Agent Questions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `claude_agent_sdk` with direct CLI invocation (`claude -p --output-format stream-json --verbose`) and transform approval gates into a conversational question/answer system.

**Architecture:** The runner spawns `claude -p` as an async subprocess, parses JSONL events from stdout, detects `AskUserQuestion` tool calls in assistant messages, and uses `--resume` for follow-ups. The backend adds an `AgentTaskQuestion` model and `WAITING_FOR_ANSWER` status. The frontend replaces the approval card with a conversational Q&A card.

**Tech Stack:** Python asyncio subprocess, Django ORM, Django Channels WebSocket, Next.js/React, TypeScript

**Design doc:** `docs/plans/2026-03-08-cli-executor-agent-questions-design.md`

---

## CLI stream-json event format (reference)

Each line of stdout is a JSON object. Key event types:

```jsonl
{"type":"system","subtype":"init","session_id":"uuid","tools":[...],"skills":[...],...}
{"type":"assistant","message":{"content":[{"type":"text","text":"..."},{"type":"tool_use","id":"...","name":"AskUserQuestion","input":{...}}],...},"session_id":"uuid"}
{"type":"result","subtype":"success","is_error":false,"result":"...","session_id":"uuid","total_cost_usd":0.02,...}
{"type":"result","subtype":"error","is_error":true,"result":"error message",...}
```

---

### Task 1: Runner — New `cli_executor.py` module

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/cli_executor.py`
- Test: `toony_agent_runner/tests/test_cli_executor.py`

**Step 1: Write the failing test**

```python
# tests/test_cli_executor.py
"""Tests for CLI executor."""

from __future__ import annotations

import asyncio
import json
import pytest

from toony_agent_runner.cli_executor import build_claude_command, parse_stream_event
from toony_agent_runner.config import ClaudeConfig


class TestBuildClaudeCommand:
    def test_basic_command(self):
        config = ClaudeConfig(
            working_directory="/tmp/test",
            permission_mode="acceptEdits",
        )
        cmd = build_claude_command("hello", config)
        assert cmd[0] == "claude"
        assert "-p" in cmd
        assert "hello" in cmd
        assert "--output-format" in cmd
        idx = cmd.index("--output-format")
        assert cmd[idx + 1] == "stream-json"
        assert "--verbose" in cmd

    def test_with_resume(self):
        config = ClaudeConfig()
        cmd = build_claude_command("hello", config, resume_session_id="abc-123")
        assert "--resume" in cmd
        idx = cmd.index("--resume")
        assert cmd[idx + 1] == "abc-123"

    def test_with_session_id(self):
        config = ClaudeConfig()
        cmd = build_claude_command("hello", config, session_id="xyz-789")
        assert "--session-id" in cmd
        idx = cmd.index("--session-id")
        assert cmd[idx + 1] == "xyz-789"

    def test_resume_takes_precedence_over_session_id(self):
        config = ClaudeConfig()
        cmd = build_claude_command(
            "hello", config, session_id="xyz", resume_session_id="abc"
        )
        assert "--resume" in cmd
        assert "--session-id" not in cmd

    def test_with_disallowed_tools(self):
        config = ClaudeConfig(disallowed_tools=["Bash(git:*)", "Edit"])
        cmd = build_claude_command("hello", config)
        assert "--disallowed-tools" in cmd
        idx = cmd.index("--disallowed-tools")
        assert cmd[idx + 1] == "Bash(git:*) Edit"

    def test_permission_mode(self):
        config = ClaudeConfig(permission_mode="bypassPermissions")
        cmd = build_claude_command("hello", config)
        assert "--permission-mode" in cmd
        idx = cmd.index("--permission-mode")
        assert cmd[idx + 1] == "bypassPermissions"


class TestParseStreamEvent:
    def test_system_init(self):
        raw = {"type": "system", "subtype": "init", "session_id": "abc-123"}
        event = parse_stream_event(raw)
        assert event["type"] == "system"
        assert event["session_id"] == "abc-123"

    def test_assistant_with_text(self):
        raw = {
            "type": "assistant",
            "message": {
                "content": [{"type": "text", "text": "Hello"}],
            },
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "assistant"

    def test_assistant_with_tool_use(self):
        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "tool_use", "name": "Read", "id": "tu1", "input": {"file_path": "/tmp/x"}},
                ],
            },
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "assistant"

    def test_result_success(self):
        raw = {
            "type": "result",
            "subtype": "success",
            "is_error": False,
            "result": "done",
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "result"
        assert event["is_error"] is False

    def test_result_error(self):
        raw = {
            "type": "result",
            "subtype": "error",
            "is_error": True,
            "result": "boom",
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "result"
        assert event["is_error"] is True

    def test_unknown_type_passes_through(self):
        raw = {"type": "rate_limit_event", "data": {}}
        event = parse_stream_event(raw)
        assert event["type"] == "rate_limit_event"


class TestExtractQuestionFromAssistant:
    def test_extracts_ask_user_question(self):
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Let me ask you something."},
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


class TestExtractToolEvents:
    def test_extracts_tool_use_events(self):
        from toony_agent_runner.cli_executor import extract_tool_events

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "I'll read the file."},
                    {
                        "type": "tool_use",
                        "name": "Read",
                        "id": "tu1",
                        "input": {"file_path": "/tmp/test.py"},
                    },
                    {
                        "type": "tool_use",
                        "name": "Edit",
                        "id": "tu2",
                        "input": {"file_path": "/tmp/test.py", "old_string": "a", "new_string": "b"},
                    },
                ],
            },
            "session_id": "abc",
        }
        events = extract_tool_events(raw)
        assert len(events) == 2
        assert events[0]["tool_name"] == "Read"
        assert events[0]["input"]["file_path"] == "/tmp/test.py"
        assert events[1]["tool_name"] == "Edit"

    def test_skips_ask_user_question(self):
        from toony_agent_runner.cli_executor import extract_tool_events

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {"question": "?"},
                    },
                ],
            },
            "session_id": "abc",
        }
        events = extract_tool_events(raw)
        assert len(events) == 0
```

**Step 2: Run test to verify it fails**

Run: `cd toony_agent_runner && python -m pytest tests/test_cli_executor.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'toony_agent_runner.cli_executor'"

**Step 3: Write the implementation**

```python
# toony_agent_runner/toony_agent_runner/cli_executor.py
"""Execute Claude via direct CLI invocation (claude -p --stream-json).

Replaces the claude_agent_sdk with asyncio subprocess management.
The CLI in --print mode loads all skills from ~/.claude/skills/ and
~/.agents/skills/, unlike the SDK which strips them.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Any, AsyncIterator

from .config import ClaudeConfig

logger = logging.getLogger("toony_agent_runner")

# Keys to extract from tool inputs by tool name (keep summary small).
_TOOL_INPUT_KEYS: dict[str, list[str]] = {
    "Read": ["file_path"],
    "Edit": ["file_path", "old_string", "new_string"],
    "Write": ["file_path"],
    "Bash": ["command", "description"],
    "Grep": ["pattern", "path", "glob"],
    "Glob": ["pattern", "path"],
    "WebFetch": ["url"],
    "WebSearch": ["query"],
    "NotebookEdit": ["notebook_path"],
}


def build_claude_command(
    prompt: str,
    config: ClaudeConfig,
    *,
    session_id: str | None = None,
    resume_session_id: str | None = None,
) -> list[str]:
    """Build the CLI command list for claude -p."""
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--verbose",
    ]

    if resume_session_id:
        cmd.extend(["--resume", resume_session_id])
    elif session_id:
        cmd.extend(["--session-id", session_id])

    cmd.extend(["--permission-mode", config.permission_mode])

    if config.allowed_tools:
        cmd.extend(["--tools", ",".join(config.allowed_tools)])

    if config.disallowed_tools:
        cmd.extend(["--disallowed-tools", " ".join(config.disallowed_tools)])

    return cmd


def _build_env(config: ClaudeConfig) -> dict[str, str]:
    """Build environment for the subprocess (inherits current, adds auth)."""
    env = os.environ.copy()
    # Remove nested-invocation blockers.
    env.pop("CLAUDECODE", None)
    env.pop("CLAUDE_CODE_ENTRYPOINT", None)

    oauth_token = (
        config.oauth_token or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    ).strip().strip("\"'")
    if oauth_token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    return env


def parse_stream_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Parse a raw stream-json event. Pass-through with type normalization."""
    return raw


def extract_question_from_assistant(event: dict[str, Any]) -> dict[str, str] | None:
    """Extract AskUserQuestion data from an assistant event.

    Returns {"text": "...", "question_id": "..."} or None.
    """
    if event.get("type") != "assistant":
        return None

    message = event.get("message", {})
    for block in message.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "AskUserQuestion":
            tool_input = block.get("input", {})
            text = tool_input.get("question", str(tool_input))
            return {
                "text": text,
                "question_id": str(uuid.uuid4()),
                "tool_use_id": block.get("id", ""),
            }
    return None


def extract_tool_events(event: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract tool_use blocks from an assistant event (excluding AskUserQuestion)."""
    if event.get("type") != "assistant":
        return []

    message = event.get("message", {})
    results = []
    for block in message.get("content", []):
        if block.get("type") != "tool_use":
            continue
        tool_name = block.get("name", "unknown")
        if tool_name == "AskUserQuestion":
            continue

        raw_input = block.get("input", {})
        keys = _TOOL_INPUT_KEYS.get(tool_name)
        if keys:
            filtered = {k: raw_input[k] for k in keys if k in raw_input}
        else:
            filtered = raw_input

        results.append({"tool_name": tool_name, "input": filtered})
    return results


def extract_text_from_assistant(event: dict[str, Any]) -> str | None:
    """Extract concatenated text blocks from an assistant event."""
    if event.get("type") != "assistant":
        return None

    message = event.get("message", {})
    parts = []
    for block in message.get("content", []):
        if block.get("type") == "text" and block.get("text"):
            parts.append(block["text"])
    return "".join(parts) if parts else None


async def run_claude(
    prompt: str,
    config: ClaudeConfig,
    *,
    cwd: str | None = None,
    session_id: str | None = None,
    resume_session_id: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Spawn claude CLI and yield parsed stream events.

    Each yielded dict has at minimum a "type" key.
    The caller is responsible for interpreting event types.
    """
    cmd = build_claude_command(
        prompt, config,
        session_id=session_id,
        resume_session_id=resume_session_id,
    )
    env = _build_env(config)
    work_dir = cwd or config.working_directory

    logger.info("Spawning: %s (cwd=%s)", " ".join(cmd[:5]) + "...", work_dir)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=work_dir,
        env=env,
    )

    try:
        async for raw_line in proc.stdout:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                yield parse_stream_event(event)
            except json.JSONDecodeError:
                logger.debug("Non-JSON line from CLI: %s", line[:200])
    finally:
        # Ensure process is cleaned up.
        if proc.returncode is None:
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                proc.kill()

        rc = proc.returncode
        if rc and rc != 0:
            stderr = ""
            if proc.stderr:
                stderr_bytes = await proc.stderr.read()
                stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
            if stderr:
                logger.warning("CLI exited %d: %s", rc, stderr[:500])


async def cancel_claude(proc: asyncio.subprocess.Process) -> None:
    """Terminate a running claude process gracefully."""
    if proc.returncode is not None:
        return
    try:
        proc.terminate()
        await asyncio.wait_for(proc.wait(), timeout=5.0)
    except (asyncio.TimeoutError, ProcessLookupError):
        proc.kill()
```

**Step 4: Run test to verify it passes**

Run: `cd toony_agent_runner && python -m pytest tests/test_cli_executor.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/cli_executor.py toony_agent_runner/tests/test_cli_executor.py
git commit -m "feat(runner): add cli_executor module for direct claude CLI invocation"
```

---

### Task 2: Runner — Update `config.py` (add `disallowed_tools`)

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/config.py:14-31`
- Test: `toony_agent_runner/tests/test_cli_executor.py` (already covers via `TestBuildClaudeCommand.test_with_disallowed_tools`)

**Step 1: Write the failing test**

Already written in Task 1: `TestBuildClaudeCommand.test_with_disallowed_tools` creates `ClaudeConfig(disallowed_tools=[...])`. This test fails because `ClaudeConfig` doesn't have `disallowed_tools` yet.

**Step 2: Verify it fails**

Run: `cd toony_agent_runner && python -m pytest tests/test_cli_executor.py::TestBuildClaudeCommand::test_with_disallowed_tools -v`
Expected: FAIL with `TypeError: __init__() got an unexpected keyword argument 'disallowed_tools'`

**Step 3: Add `disallowed_tools` to `ClaudeConfig`**

In `toony_agent_runner/toony_agent_runner/config.py`, add `disallowed_tools` to the `ClaudeConfig` dataclass (after line 31) and update `load_config` to parse it:

```python
# In ClaudeConfig dataclass, add after allowed_tools:
    disallowed_tools: list[str] = field(default_factory=list)
```

In `load_config()`, add after the `allowed_tools` line (after line 88):

```python
            disallowed_tools=claude_raw.get(
                "disallowed_tools", ClaudeConfig.disallowed_tools
            ),
```

Also add `"AskUserQuestion"` to `_DEFAULT_ALLOWED_TOOLS` (line 14-20) since the CLI handles it natively now — no hook interception needed:

```python
_DEFAULT_ALLOWED_TOOLS = [
    "Read", "Edit", "Write", "Bash", "Grep", "Glob",
    "WebFetch", "WebSearch", "NotebookEdit",
    "AskUserQuestion",
]
```

Remove the NOTE comment about AskUserQuestion being excluded (lines 17-19).

**Step 4: Run test to verify it passes**

Run: `cd toony_agent_runner && python -m pytest tests/test_cli_executor.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/config.py
git commit -m "feat(runner): add disallowed_tools config and include AskUserQuestion in defaults"
```

---

### Task 3: Runner — Update `protocol.py` (approval → question)

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py`
- Modify: `toony_agent_runner/tests/test_protocol.py`

**Step 1: Write the failing test**

Add to `toony_agent_runner/tests/test_protocol.py`:

```python
from toony_agent_runner.protocol import (
    QuestionAskedMessage,
    QuestionAnswered,
    parse_server_message,
)


class TestQuestionAskedMessage:
    def test_to_json(self):
        msg = QuestionAskedMessage(
            task_id="task-1",
            session_id="sess-1",
            question_id="q-1",
            question_text="What framework?",
        )
        j = msg.to_json()
        assert j == {
            "type": "question.asked",
            "task_id": "task-1",
            "session_id": "sess-1",
            "question_id": "q-1",
            "question": {
                "text": "What framework?",
                "type": "free_text",
            },
        }


class TestQuestionAnswered:
    def test_parse_question_answered(self):
        raw = {
            "type": "question.answered",
            "task_id": "task-1",
            "question_id": "q-1",
            "answer": "React",
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, QuestionAnswered)
        assert msg.task_id == "task-1"
        assert msg.question_id == "q-1"
        assert msg.answer == "React"
```

**Step 2: Run test to verify it fails**

Run: `cd toony_agent_runner && python -m pytest tests/test_protocol.py::TestQuestionAskedMessage -v`
Expected: FAIL with `ImportError`

**Step 3: Modify protocol.py**

Replace `ApprovalNeededMessage` with `QuestionAskedMessage`, replace `ApprovalResponse` with `QuestionAnswered`, update `parse_server_message`:

In `protocol.py`:

1. Replace the `ApprovalNeededMessage` dataclass (lines 71-85) with:

```python
@dataclass
class QuestionAskedMessage:
    """Signals that Claude is asking the user a question."""

    task_id: str
    session_id: str
    question_id: str
    question_text: str

    def to_json(self) -> dict:
        return {
            "type": "question.asked",
            "task_id": self.task_id,
            "session_id": self.session_id,
            "question_id": self.question_id,
            "question": {
                "text": self.question_text,
                "type": "free_text",
            },
        }
```

2. Replace `ApprovalResponse` dataclass (lines 137-142) with:

```python
@dataclass
class QuestionAnswered:
    """Backend relays a user's answer to a question."""

    task_id: str
    question_id: str
    answer: str
```

3. In `parse_server_message`, replace the `approval.response` handler (lines 246-251) with:

```python
    if msg_type == "question.answered":
        return QuestionAnswered(
            task_id=data["task_id"],
            question_id=data["question_id"],
            answer=data.get("answer", ""),
        )
```

4. Update `IncomingMessage` type alias (line 228) to replace `ApprovalResponse` with `QuestionAnswered`.

5. Update the module docstring (lines 1-12) to reflect new message names.

**Step 4: Run tests**

Run: `cd toony_agent_runner && python -m pytest tests/test_protocol.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/protocol.py toony_agent_runner/tests/test_protocol.py
git commit -m "feat(runner): rename approval messages to question.asked/question.answered"
```

---

### Task 4: Runner — Update `connection.py` (pending_approvals → pending_questions)

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/connection.py:60`

**Step 1: Rename `pending_approvals` to `pending_questions`**

In `connection.py` line 60, change:

```python
self.pending_approvals: dict[str, asyncio.Future[dict[str, Any]]] = {}
```

to:

```python
self.pending_questions: dict[str, asyncio.Future[dict[str, Any]]] = {}
```

**Step 2: Run existing tests to verify nothing breaks**

Run: `cd toony_agent_runner && python -m pytest tests/ -v`
Expected: PASS (nothing references `pending_approvals` yet since we'll update main.py later)

**Step 3: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/connection.py
git commit -m "refactor(runner): rename pending_approvals to pending_questions"
```

---

### Task 5: Runner — Rewrite `task_executor.py` to use CLI

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/task_executor.py` (full rewrite)

**Step 1: Write the new task_executor.py**

Replace entire contents of `toony_agent_runner/toony_agent_runner/task_executor.py`:

```python
"""Task execution via direct Claude CLI invocation."""

from __future__ import annotations

import asyncio
import logging

from .cli_executor import (
    extract_question_from_assistant,
    extract_text_from_assistant,
    extract_tool_events,
    run_claude,
)
from .config import RunnerConfig
from .connection import BackendConnection
from .protocol import (
    QuestionAskedMessage,
    TaskAcceptedMessage,
    TaskCompletedMessage,
    TaskEventMessage,
    TaskFailedMessage,
)

logger = logging.getLogger("toony_agent_runner")

EVENT_TYPE_LOG = "LOG"
EVENT_TYPE_TOOL_USE = "TOOL_USE"
EVENT_TYPE_ERROR = "ERROR"


async def execute_task(
    task_id: str,
    prompt: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
) -> None:
    """Execute a task by spawning claude CLI and streaming events."""
    await conn.send(TaskAcceptedMessage(task_id).to_json())

    sequence = 0
    session_id: str | None = None

    try:
        async for event in run_claude(
            prompt, config.claude, cwd=config.claude.working_directory,
        ):
            if cancel_event.is_set():
                logger.info("Task %s cancelled", task_id)
                await conn.send(
                    TaskFailedMessage(task_id, error="Task cancelled by user").to_json()
                )
                return

            etype = event.get("type", "")

            # Capture session_id from system init or assistant events.
            if event.get("session_id"):
                session_id = str(event["session_id"])

            if etype == "system":
                continue

            if etype == "assistant":
                # Check for AskUserQuestion.
                question = extract_question_from_assistant(event)
                if question:
                    await conn.send(
                        QuestionAskedMessage(
                            task_id=task_id,
                            session_id=session_id or "",
                            question_id=question["question_id"],
                            question_text=question["text"],
                        ).to_json()
                    )
                    logger.info(
                        "Question asked for task %s: %s",
                        task_id, question["text"][:100],
                    )
                    # Don't return here — the CLI will emit a result event
                    # after AskUserQuestion since it's in -p mode.
                    # But we still forward tool events from this message.

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

            elif etype == "result":
                if event.get("session_id"):
                    session_id = str(event["session_id"])

                if event.get("is_error"):
                    error_msg = event.get("result", "Claude CLI error")
                    await conn.send(
                        TaskFailedMessage(task_id, error=error_msg).to_json()
                    )
                    return

                result_text = event.get("result", "Task completed")
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=result_text, session_id=session_id,
                    ).to_json()
                )
                return

            # Skip rate_limit_event and other unknown types.

    except asyncio.CancelledError:
        logger.info("Task %s async-cancelled", task_id)
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )
        return

    except Exception as exc:
        logger.exception("Task %s failed: %s", task_id, exc)
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )
        return

    # If we exit without a result event, report completion.
    await conn.send(
        TaskCompletedMessage(
            task_id, result="Task completed", session_id=session_id,
        ).to_json()
    )


async def execute_task_reply(
    task_id: str,
    message: str,
    session_id: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
    sequence_offset: int = 0,
) -> None:
    """Resume a task conversation using --resume."""
    sequence = sequence_offset
    new_session_id: str | None = None

    try:
        async for event in run_claude(
            message, config.claude,
            cwd=config.claude.working_directory,
            resume_session_id=session_id,
        ):
            if cancel_event.is_set():
                logger.info("Task reply %s cancelled", task_id)
                await conn.send(
                    TaskFailedMessage(task_id, error="Task cancelled by user").to_json()
                )
                return

            etype = event.get("type", "")

            if event.get("session_id"):
                new_session_id = str(event["session_id"])

            if etype == "system":
                continue

            if etype == "assistant":
                question = extract_question_from_assistant(event)
                if question:
                    await conn.send(
                        QuestionAskedMessage(
                            task_id=task_id,
                            session_id=new_session_id or session_id,
                            question_id=question["question_id"],
                            question_text=question["text"],
                        ).to_json()
                    )

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

            elif etype == "result":
                if event.get("session_id"):
                    new_session_id = str(event["session_id"])

                final_sid = new_session_id or session_id

                if event.get("is_error"):
                    error_msg = event.get("result", "Claude CLI error")
                    await conn.send(
                        TaskFailedMessage(task_id, error=error_msg).to_json()
                    )
                    return

                result_text = event.get("result", "Task completed")
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=result_text, session_id=final_sid,
                    ).to_json()
                )
                return

    except asyncio.CancelledError:
        logger.info("Task reply %s async-cancelled", task_id)
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )
        return

    except Exception as exc:
        logger.exception("Task reply %s failed: %s", task_id, exc)
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )
        return

    final_sid = new_session_id or session_id
    await conn.send(
        TaskCompletedMessage(
            task_id, result="Task completed", session_id=final_sid,
        ).to_json()
    )
```

**Step 2: Run all runner tests**

Run: `cd toony_agent_runner && python -m pytest tests/ -v`
Expected: PASS

**Step 3: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/task_executor.py
git commit -m "feat(runner): rewrite task_executor to use CLI instead of SDK"
```

---

### Task 6: Runner — Update `main.py` (question.answered handler)

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/main.py`

**Step 1: Update imports and handler**

In `main.py`:

1. Replace `ApprovalResponse` import (line 29) with `QuestionAnswered`:

```python
from .protocol import (
    QuestionAnswered,
    CommandExecute,
    ...
)
```

2. Replace the `ApprovalResponse` handler (lines 266-281) with:

```python
            elif isinstance(msg, QuestionAnswered):
                logger.info(
                    "Received question.answered for %s (q=%s)",
                    msg.task_id,
                    msg.question_id,
                )
                future = conn.pending_questions.get(msg.task_id)
                if future is not None and not future.done():
                    future.set_result({
                        "question_id": msg.question_id,
                        "answer": msg.answer,
                    })
                else:
                    logger.warning(
                        "No pending question for task %s", msg.task_id
                    )
```

3. Update the module docstring (lines 1-12) to mention question-based flow instead of approval gates.

**Step 2: Run all tests**

Run: `cd toony_agent_runner && python -m pytest tests/ -v`
Expected: PASS

**Step 3: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/main.py
git commit -m "feat(runner): update main loop to handle question.answered messages"
```

---

### Task 7: Runner — Delete `sdk_helpers.py` and `stream_parser.py`

**Files:**
- Delete: `toony_agent_runner/toony_agent_runner/sdk_helpers.py`
- Delete: `toony_agent_runner/toony_agent_runner/stream_parser.py`

**Step 1: Delete the files**

```bash
rm toony_agent_runner/toony_agent_runner/sdk_helpers.py
rm toony_agent_runner/toony_agent_runner/stream_parser.py
```

**Step 2: Remove `claude-agent-sdk` from dependencies**

In `toony_agent_runner/pyproject.toml`, remove `claude-agent-sdk` from the dependencies list.

**Step 3: Run all tests**

Run: `cd toony_agent_runner && python -m pytest tests/ -v`
Expected: PASS (no test references deleted modules)

**Step 4: Commit**

```bash
git add -A toony_agent_runner/
git commit -m "refactor(runner): remove sdk_helpers, stream_parser, and claude-agent-sdk dependency"
```

---

### Task 8: Backend — Add `WAITING_FOR_ANSWER` status to `AgentTask`

**Files:**
- Modify: `backend/toony_agents/models/agent_task.py:7-14`

**Step 1: Add status choice**

In `agent_task.py`, replace `AWAITING_APPROVAL` with `WAITING_FOR_ANSWER`:

```python
class AgentTaskStatus(models.TextChoices):
    QUEUED = "QUEUED", "Queued"
    ASSIGNED = "ASSIGNED", "Assigned"
    RUNNING = "RUNNING", "Running"
    WAITING_FOR_ANSWER = "WAITING_FOR_ANSWER", "Waiting for Answer"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"
```

**Step 2: Generate migration**

Run: `make makemigrations`
Expected: Creates a new migration altering the `status` field choices.

**Step 3: Run migration**

Run: `make migrate`
Expected: Applied successfully.

**Step 4: Commit**

```bash
git add backend/toony_agents/models/agent_task.py backend/toony_agents/migrations/
git commit -m "feat(backend): rename AWAITING_APPROVAL to WAITING_FOR_ANSWER status"
```

---

### Task 9: Backend — Add `TaskEventType` values for questions

**Files:**
- Modify: `backend/toony_agents/models/task_event.py:6-14`

**Step 1: Update TaskEventType choices**

Replace `APPROVAL_NEEDED` and `APPROVAL_RESPONSE` with `QUESTION_ASKED` and `QUESTION_ANSWERED`:

```python
class TaskEventType(models.TextChoices):
    LOG = "LOG", "Log"
    TOOL_USE = "TOOL_USE", "Tool Use"
    TOOL_RESULT = "TOOL_RESULT", "Tool Result"
    QUESTION_ASKED = "QUESTION_ASKED", "Question Asked"
    QUESTION_ANSWERED = "QUESTION_ANSWERED", "Question Answered"
    REPLY = "REPLY", "Reply"
    STATUS_CHANGE = "STATUS_CHANGE", "Status Change"
    ERROR = "ERROR", "Error"
```

**Step 2: Generate and run migration**

Run: `make makemigrations && make migrate`

**Step 3: Commit**

```bash
git add backend/toony_agents/models/task_event.py backend/toony_agents/migrations/
git commit -m "feat(backend): rename APPROVAL event types to QUESTION"
```

---

### Task 10: Backend — Add `AgentTaskQuestion` model

**Files:**
- Create: `backend/toony_agents/models/agent_task_question.py`
- Modify: `backend/toony_agents/models/__init__.py`

**Step 1: Create the model**

```python
# backend/toony_agents/models/agent_task_question.py
from django.db import models

from common.models import BaseModel


class AgentTaskQuestion(BaseModel):
    """A question asked by Claude during task execution."""

    task = models.ForeignKey(
        "toony_agents.AgentTask",
        on_delete=models.CASCADE,
        related_name="questions",
    )
    question_id = models.UUIDField(unique=True)
    text = models.TextField()
    answer = models.TextField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    session_id = models.CharField(max_length=255)

    class Meta:
        db_table = "agent_task_questions"
        ordering = ["created_at"]

    def __str__(self):
        status = "answered" if self.answer else "pending"
        return f"Question {self.question_id} ({status})"
```

**Step 2: Add to `__init__.py`**

In `backend/toony_agents/models/__init__.py`, add:

```python
from .agent_task_question import AgentTaskQuestion
```

**Step 3: Generate and run migration**

Run: `make makemigrations && make migrate`

**Step 4: Commit**

```bash
git add backend/toony_agents/models/ backend/toony_agents/migrations/
git commit -m "feat(backend): add AgentTaskQuestion model"
```

---

### Task 11: Backend — Update consumers.py (question.asked/answered)

**Files:**
- Modify: `backend/toony_agents/consumers.py`

**Step 1: Add DB helper for questions**

Add after line 152:

```python
@database_sync_to_async
def _create_task_question(task_id, question_id, text, session_id):
    from toony_agents.models import AgentTaskQuestion
    return AgentTaskQuestion.objects.create(
        task_id=task_id,
        question_id=question_id,
        text=text,
        session_id=session_id,
    )


@database_sync_to_async
def _answer_task_question(question_id, answer):
    from toony_agents.models import AgentTaskQuestion
    return AgentTaskQuestion.objects.filter(
        question_id=question_id,
    ).update(answer=answer, answered_at=timezone.now())
```

**Step 2: In `ToonyAgentRunnerConsumer.receive_json`, replace the `approval.needed` handler (lines 284-311)**

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
                task_id, AgentTaskStatus.WAITING_FOR_ANSWER,
                toony_agent_id=self.agent_id,
            )
            await _create_task_question(
                task_id, question_id, question_text, session_id,
            )
            await _create_task_event(
                task_id, TaskEventType.QUESTION_ASKED,
                {"question_id": question_id, "text": question_text},
                sequence,
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "question_asked",
                    "data": {
                        "task_id": task_id,
                        "question_id": question_id,
                        "text": question_text,
                        "sequence": sequence,
                    },
                },
            )
```

**Step 3: In `ToonyAgentRunnerConsumer`, replace `approval_response` group handler (lines 392-398)**

```python
    async def question_answered(self, event):
        await self.send_json({
            "type": "question.answered",
            "task_id": event["data"]["task_id"],
            "question_id": event["data"]["question_id"],
            "answer": event["data"]["answer"],
        })
```

**Step 4: In `ToonyAgentConsumer.receive_json`, replace `approval.response` handler (lines 468-501)**

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
                task_id, TaskEventType.QUESTION_ANSWERED,
                {"question_id": question_id, "answer": answer},
                content.get("sequence", 0),
            )
            await _update_task_status(task_id, AgentTaskStatus.RUNNING)
            await self.channel_layer.group_send(
                runner_group,
                {
                    "type": "question_answered",
                    "data": {
                        "task_id": task_id,
                        "question_id": question_id,
                        "answer": answer,
                    },
                },
            )
```

**Step 5: In `ToonyAgentConsumer`, replace `approval_needed` group handler (lines 599-600)**

```python
    async def question_asked(self, event):
        await self.send_json({"type": "question.asked", **event["data"]})
```

**Step 6: Run backend tests**

Run: `make test`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/toony_agents/consumers.py
git commit -m "feat(backend): replace approval protocol with question.asked/answered in consumers"
```

---

### Task 12: Frontend — Update TypeScript types

**Files:**
- Modify: `frontend/types/toony-agents.ts`

**Step 1: Update types**

Replace `AWAITING_APPROVAL` with `WAITING_FOR_ANSWER` in `AgentTaskStatus`:

```typescript
export type AgentTaskStatus =
  | "QUEUED"
  | "ASSIGNED"
  | "RUNNING"
  | "WAITING_FOR_ANSWER"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
```

Replace `APPROVAL_NEEDED` / `APPROVAL_RESPONSE` in `TaskEventType`:

```typescript
export type TaskEventType =
  | "LOG"
  | "TOOL_USE"
  | "TOOL_RESULT"
  | "QUESTION_ASKED"
  | "QUESTION_ANSWERED"
  | "REPLY"
  | "STATUS_CHANGE"
  | "ERROR";
```

Replace `ApprovalNeededWsEvent` (lines 129-138) with:

```typescript
export interface QuestionAskedWsEvent {
  type: "question.asked";
  task_id: string;
  question_id: string;
  text: string;
  sequence: number;
}
```

Update `ToonyAgentWsEvent` union:

```typescript
export type ToonyAgentWsEvent =
  | ToonyAgentStatusWsEvent
  | TaskStatusWsEvent
  | TaskEventWsEvent
  | QuestionAskedWsEvent
  | ConfigSyncStatusWsEvent;
```

**Step 2: Commit**

```bash
git add frontend/types/toony-agents.ts
git commit -m "feat(frontend): update types for question-based protocol"
```

---

### Task 13: Frontend — Update WebSocket hook

**Files:**
- Modify: `frontend/hooks/use-toony-agent-websocket.ts`

**Step 1: Replace `sendApproval` with `sendAnswer`**

Replace the `sendApproval` callback (lines 47-57) with:

```typescript
  const sendAnswer = useCallback(
    (taskId: string, questionId: string, answer: string) => {
      send({
        type: "question.answered",
        task_id: taskId,
        question_id: questionId,
        answer,
      });
    },
    [send],
  );
```

Update the return type and return statement:

```typescript
  return { readyState, sendAnswer, sendReply, cancelTask, sendConfigSync };
```

**Step 2: Commit**

```bash
git add frontend/hooks/use-toony-agent-websocket.ts
git commit -m "feat(frontend): replace sendApproval with sendAnswer in WS hook"
```

---

### Task 14: Frontend — Replace ApprovalGateCard with AgentQuestionCard

**Files:**
- Create: `frontend/components/toony-agents/agent-question-card.tsx`
- Delete: `frontend/components/toony-agents/approval-gate-card.tsx`

**Step 1: Create AgentQuestionCard**

```typescript
// frontend/components/toony-agents/agent-question-card.tsx
"use client";

import { useState } from "react";

interface AgentQuestionCardProps {
  question: string;
  questionId: string;
  onAnswer: (questionId: string, answer: string) => void;
  isAnswered: boolean;
  previousAnswer?: string;
}

export function AgentQuestionCard({
  question,
  questionId,
  onAnswer,
  isAnswered,
  previousAnswer,
}: AgentQuestionCardProps) {
  const [answerText, setAnswerText] = useState("");

  function handleSend() {
    const text = answerText.trim();
    if (!text) return;
    onAnswer(questionId, text);
    setAnswerText("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const cardClass = isAnswered
    ? "rounded-lg border-2 border-slate-700 bg-slate-900/50 p-4 opacity-60"
    : "rounded-lg border-2 border-indigo-500/50 bg-indigo-500/5 p-4";

  return (
    <div className={cardClass}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-indigo-400 text-sm font-medium">
          Agent Question
        </span>
      </div>

      <p className="text-sm text-slate-200 leading-relaxed">{question}</p>

      {isAnswered && previousAnswer && (
        <div className="mt-2 rounded-md bg-slate-800/50 px-3 py-2">
          <span className="text-xs text-slate-500">Your answer: </span>
          <span className="text-sm text-slate-300">{previousAnswer}</span>
        </div>
      )}

      {!isAnswered && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!answerText.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Delete old component**

```bash
rm frontend/components/toony-agents/approval-gate-card.tsx
```

**Step 3: Commit**

```bash
git add frontend/components/toony-agents/agent-question-card.tsx
git rm frontend/components/toony-agents/approval-gate-card.tsx
git commit -m "feat(frontend): replace ApprovalGateCard with AgentQuestionCard"
```

---

### Task 15: Frontend — Update TaskEventItem component

**Files:**
- Modify: `frontend/components/toony-agents/task-event-item.tsx`

**Step 1: Update imports and cases**

Replace the `ApprovalGateCard` import with `AgentQuestionCard`. Replace props `onApprove`/`onReject` with `onAnswer`. Replace `isApprovalResolved` with `isAnswered`.

Replace the `APPROVAL_NEEDED` case (lines 83-100) with:

```typescript
    case "QUESTION_ASKED": {
      const data = event.data as {
        text?: string;
        question_id?: string;
      };
      return (
        <div className="py-2">
          <AgentQuestionCard
            question={String(data.text ?? "Agent has a question")}
            questionId={String(data.question_id ?? "")}
            onAnswer={onAnswer ?? (() => {})}
            isAnswered={isAnswered ?? false}
          />
        </div>
      );
    }
```

Replace the `APPROVAL_RESPONSE` case (lines 102-115) with:

```typescript
    case "QUESTION_ANSWERED":
      return (
        <div className="py-1">
          <span className="text-slate-400 text-sm">
            Your answer:{" "}
            <span className="font-medium text-slate-200">
              {String(event.data.answer ?? "")}
            </span>
          </span>
        </div>
      );
```

**Step 2: Commit**

```bash
git add frontend/components/toony-agents/task-event-item.tsx
git commit -m "feat(frontend): update TaskEventItem for question events"
```

---

### Task 16: Frontend — Update TaskLiveOutput component

**Files:**
- Modify: `frontend/components/toony-agents/task-live-output.tsx`

**Step 1: Update props**

Replace `onApprove`, `onReject` callbacks with `onAnswer`. Replace `approvedSequences` with `answeredSequences`.

Update the `TaskLiveOutputProps` interface:

```typescript
interface TaskLiveOutputProps {
  events: TaskEventItem[];
  taskStatus: AgentTaskStatus;
  onAnswer: (questionId: string, answer: string) => void;
  onMessage: (text: string) => void;
  answeredSequences: Set<number>;
  canReply?: boolean;
}
```

Update the `TaskEventItem` rendering to pass `onAnswer` and `isAnswered` instead of `onApprove`/`onReject`/`isApprovalResolved`.

**Step 2: Commit**

```bash
git add frontend/components/toony-agents/task-live-output.tsx
git commit -m "feat(frontend): update TaskLiveOutput for question-based flow"
```

---

### Task 17: Frontend — Update TaskPipelinePanel

**Files:**
- Modify: `frontend/components/toony-agents/task-pipeline-panel.tsx`

**Step 1: Update references**

Replace `hasApprovalGate` with `hasQuestion` in the `PipelineStage` interface. Update the event classification to check for `QUESTION_ASKED` instead of `APPROVAL_NEEDED`.

**Step 2: Commit**

```bash
git add frontend/components/toony-agents/task-pipeline-panel.tsx
git commit -m "feat(frontend): update pipeline panel for question events"
```

---

### Task 18: Frontend — Update Task Detail Page

**Files:**
- Modify: `frontend/app/(dashboard)/toony-agents/[id]/tasks/[taskId]/page.tsx`

**Step 1: Update status references**

Replace all `AWAITING_APPROVAL` with `WAITING_FOR_ANSWER`. Replace `approval.needed` with `question.asked` in the WebSocket handler.

**Step 2: Replace approval handlers with answer handler**

Replace `handleApprove`, `handleReject` (lines 157-171) with:

```typescript
  const handleAnswer = useCallback(
    (questionId: string, answer: string) => {
      sendAnswer(taskId, questionId, answer);
      // Find the sequence of this question to mark as answered
      const questionEvent = events.find(
        (e) => e.event_type === "QUESTION_ASKED" && (e.data as { question_id?: string }).question_id === questionId
      );
      if (questionEvent) {
        setAnsweredSequences((prev) => new Set(prev).add(questionEvent.sequence));
      }
    },
    [taskId, sendAnswer, events]
  );
```

Update `handleMessage` to use `sendReply` only (remove the `sendApproval` branch).

**Step 3: Update WebSocket handler**

Replace the `approval.needed` handler (lines 129-145) with:

```typescript
      } else if (
        event.type === "question.asked" &&
        event.task_id === taskId
      ) {
        const newEvent: TaskEventItem = {
          id: `ws-question-${event.sequence}`,
          event_type: "QUESTION_ASKED",
          data: { question_id: event.question_id, text: event.text },
          sequence: event.sequence,
          created_at: new Date().toISOString(),
        };
        setEvents((prev) => {
          if (prev.some((e) => e.id === newEvent.id)) return prev;
          return [...prev, newEvent];
        });
      }
```

**Step 4: Update resolved tracking**

Rename `approvedSequences` → `answeredSequences`. Update `fetchData` to detect `QUESTION_ASKED` / `QUESTION_ANSWERED` pairs instead of `APPROVAL_NEEDED` / `APPROVAL_RESPONSE`.

**Step 5: Update isActive check**

```typescript
  const isActive =
    taskStatus === "RUNNING" || taskStatus === "WAITING_FOR_ANSWER";
```

**Step 6: Pass updated props to `TaskLiveOutput`**

Replace `onApprove`, `onReject`, `approvedSequences` with `onAnswer`, `answeredSequences`.

**Step 7: Update status colors/labels**

Replace `AWAITING_APPROVAL` entries in `TASK_STATUS_COLORS` and `TASK_STATUS_LABELS`:

```typescript
  WAITING_FOR_ANSWER: "bg-purple-500/15 text-purple-400",
  // ...
  WAITING_FOR_ANSWER: "Waiting for Answer",
```

**Step 8: Commit**

```bash
git add frontend/app/\(dashboard\)/toony-agents/\[id\]/tasks/\[taskId\]/page.tsx
git commit -m "feat(frontend): update task detail page for question-based flow"
```

---

### Task 19: Frontend — Update Agent Detail Page status references

**Files:**
- Modify: `frontend/app/(dashboard)/toony-agents/[id]/page.tsx:30-48`

**Step 1: Update status styling/labels**

Replace `AWAITING_APPROVAL` with `WAITING_FOR_ANSWER` in `TASK_STATUS_STYLES` and `TASK_STATUS_LABELS`.

**Step 2: Commit**

```bash
git add frontend/app/\(dashboard\)/toony-agents/\[id\]/page.tsx
git commit -m "feat(frontend): update agent detail page for WAITING_FOR_ANSWER status"
```

---

### Task 20: Frontend lint and build verification

**Step 1: Run frontend lint**

Run: `make lint-frontend`
Expected: PASS with no errors

**Step 2: Run frontend build**

Run: `cd frontend && ./node_modules/.bin/next build`
Expected: Build succeeds

**Step 3: Fix any lint/type errors**

Fix as needed.

**Step 4: Commit fixes if any**

```bash
git add frontend/
git commit -m "fix(frontend): resolve lint and type errors from question refactor"
```

---

### Task 21: Backend tests

**Step 1: Run backend tests**

Run: `make test`
Expected: PASS

**Step 2: Fix any failures related to renamed statuses/event types**

Check for hardcoded `AWAITING_APPROVAL`, `APPROVAL_NEEDED`, `APPROVAL_RESPONSE` in test files.

**Step 3: Commit fixes if any**

```bash
git add backend/
git commit -m "fix(backend): update tests for question-based protocol"
```

---

### Task 22: Final integration verification

**Step 1: Start all services**

Run: `make up`

**Step 2: Verify backend starts without errors**

Run: `make logs-backend`
Expected: No migration or import errors

**Step 3: Verify frontend builds and starts**

Run: `make logs-frontend`
Expected: No build errors

**Step 4: Final commit (if needed)**

```bash
git add -A
git commit -m "chore: final cleanup for CLI executor + agent questions"
```
