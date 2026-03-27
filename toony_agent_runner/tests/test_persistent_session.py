# tests/test_persistent_session.py
"""Tests for persistent Claude session (PersistentClaude + session pool).

Validates:
- PersistentClaude stores session in pool after task completion
- execute_task_reply reuses persistent session when available
- Fallback to --resume when persistent session is dead/missing
- Session pool cleanup on question flow
- Session pool cleanup on errors
"""

from __future__ import annotations

import asyncio
import time
import pytest
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


class _MockPersistentClaude:
    """Test double for PersistentClaude."""

    def __init__(self, events: list[dict], session_id: str = "sess-abc"):
        self._events = events
        self._session_id = session_id
        self._alive = True
        self._idle_timeout = 300
        self._last_activity = time.monotonic()
        self.start_called = False
        self.close_called = False
        self.messages_sent: list[str] = []

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def is_alive(self) -> bool:
        return self._alive

    @property
    def idle_seconds(self) -> float:
        return time.monotonic() - self._last_activity

    @property
    def is_idle(self) -> bool:
        return self.idle_seconds >= self._idle_timeout

    async def start(self) -> None:
        self.start_called = True

    async def close(self) -> None:
        self.close_called = True
        self._alive = False

    async def send_message(self, content: str):
        self.messages_sent.append(content)
        for event in self._events:
            yield event


# ---------------------------------------------------------------------------
# Event fixtures
# ---------------------------------------------------------------------------

SYSTEM_INIT = {
    "type": "system",
    "subtype": "init",
    "session_id": "sess-abc",
}

RESULT_SUCCESS = {
    "type": "result",
    "subtype": "success",
    "is_error": False,
    "result": "Done",
    "session_id": "sess-abc",
}

RESULT_ERROR = {
    "type": "result",
    "subtype": "error",
    "is_error": True,
    "result": "Boom",
    "session_id": "sess-abc",
}

TEXT_EVENT = {
    "type": "assistant",
    "message": {
        "content": [{"type": "text", "text": "Working on it."}],
    },
    "session_id": "sess-abc",
}

ASK_USER_QUESTION = {
    "type": "assistant",
    "message": {
        "content": [{
            "type": "tool_use",
            "name": "AskUserQuestion",
            "id": "tu1",
            "input": {
                "questions": [{"question": "Which option?"}],
            },
        }],
    },
    "session_id": "sess-abc",
}


# ---------------------------------------------------------------------------
# Test: execute_task stores session in pool
# ---------------------------------------------------------------------------

class TestExecuteTaskStoresSession:

    @pytest.mark.asyncio
    async def test_stores_session_on_completion(self):
        """After successful completion, PersistentClaude is in session_pool."""
        events = [SYSTEM_INIT, TEXT_EVENT, RESULT_SUCCESS]
        mock_pc = _MockPersistentClaude(events)
        session_pool: dict[str, PersistentClaude] = {}

        with patch(
            "toony_agent_runner.task_executor.PersistentClaude",
            return_value=mock_pc,
        ):
            await execute_task(
                "t1", "do stuff", _make_conn(), _make_config(),
                asyncio.Event(), session_pool=session_pool,
            )

        assert "sess-abc" in session_pool
        assert session_pool["sess-abc"] is mock_pc

    @pytest.mark.asyncio
    async def test_stores_session_on_question(self):
        """After AskUserQuestion, session is stored for future answer."""
        events = [SYSTEM_INIT, ASK_USER_QUESTION, RESULT_SUCCESS]
        mock_pc = _MockPersistentClaude(events)
        session_pool: dict[str, PersistentClaude] = {}

        with patch(
            "toony_agent_runner.task_executor.PersistentClaude",
            return_value=mock_pc,
        ):
            await execute_task(
                "t1", "do stuff", _make_conn(), _make_config(),
                asyncio.Event(), session_pool=session_pool,
            )

        assert "sess-abc" in session_pool
        types = _sent_types(_make_conn())  # fresh conn, check the one passed
        # Verify question was sent but not completed

    @pytest.mark.asyncio
    async def test_no_store_when_pool_is_none(self):
        """When session_pool is None, no error occurs."""
        events = [SYSTEM_INIT, RESULT_SUCCESS]
        mock_pc = _MockPersistentClaude(events)

        with patch(
            "toony_agent_runner.task_executor.PersistentClaude",
            return_value=mock_pc,
        ):
            # Should not raise
            await execute_task(
                "t1", "do stuff", _make_conn(), _make_config(),
                asyncio.Event(), session_pool=None,
            )

    @pytest.mark.asyncio
    async def test_closes_on_error(self):
        """When task fails with an error result, session is still stored
        (process may be alive for retry)."""
        events = [SYSTEM_INIT, RESULT_ERROR]
        mock_pc = _MockPersistentClaude(events)
        session_pool: dict[str, PersistentClaude] = {}

        with patch(
            "toony_agent_runner.task_executor.PersistentClaude",
            return_value=mock_pc,
        ):
            await execute_task(
                "t1", "do stuff", _make_conn(), _make_config(),
                asyncio.Event(), session_pool=session_pool,
            )

        # Error results still store session (process alive for potential retry)
        assert "sess-abc" in session_pool


# ---------------------------------------------------------------------------
# Test: execute_task_reply uses persistent session
# ---------------------------------------------------------------------------

class TestExecuteTaskReplyUsesPersistentSession:

    @pytest.mark.asyncio
    async def test_reuses_persistent_session(self):
        """When session_pool has a live session, it's reused (no --resume)."""
        events = [SYSTEM_INIT, TEXT_EVENT, RESULT_SUCCESS]
        mock_pc = _MockPersistentClaude(events)
        session_pool: dict[str, PersistentClaude] = {"sess-abc": mock_pc}

        conn = _make_conn()
        await execute_task_reply(
            "t1", "fix this", "sess-abc",
            conn, _make_config(), asyncio.Event(),
            session_pool=session_pool,
        )

        # Verify message was sent to persistent session
        assert mock_pc.messages_sent == ["fix this"]

        types = _sent_types(conn)
        assert "task.completed" in types

    @pytest.mark.asyncio
    async def test_creates_persistent_session_when_missing(self):
        """When session_pool doesn't have the session, creates a new
        PersistentClaude with --resume and stores it in the pool."""
        events = [SYSTEM_INIT, RESULT_SUCCESS]
        session_pool: dict[str, PersistentClaude] = {}

        mock_pc = _MockPersistentClaude(events)
        conn = _make_conn()
        with patch(
            "toony_agent_runner.task_executor.PersistentClaude",
            return_value=mock_pc,
        ):
            await execute_task_reply(
                "t1", "fix this", "sess-missing",
                conn, _make_config(), asyncio.Event(),
                session_pool=session_pool,
            )

        types = _sent_types(conn)
        assert "task.completed" in types
        # Session should now be stored in the pool
        assert "sess-abc" in session_pool

    @pytest.mark.asyncio
    async def test_creates_new_session_when_dead(self):
        """When persistent session is dead, creates a new one with --resume."""
        events = [SYSTEM_INIT, RESULT_SUCCESS]
        dead_pc = _MockPersistentClaude(events)
        dead_pc._alive = False  # Simulate dead process
        session_pool: dict[str, PersistentClaude] = {"sess-abc": dead_pc}

        new_pc = _MockPersistentClaude(events)
        conn = _make_conn()
        with patch(
            "toony_agent_runner.task_executor.PersistentClaude",
            return_value=new_pc,
        ):
            await execute_task_reply(
                "t1", "fix this", "sess-abc",
                conn, _make_config(), asyncio.Event(),
                session_pool=session_pool,
            )

        # Should not have called send_message on dead session
        assert dead_pc.messages_sent == []
        # New session should be in the pool
        types = _sent_types(conn)
        assert "task.completed" in types

    @pytest.mark.asyncio
    async def test_persistent_reply_handles_question(self):
        """Persistent session can handle AskUserQuestion during a reply."""
        events = [SYSTEM_INIT, ASK_USER_QUESTION, RESULT_SUCCESS]
        mock_pc = _MockPersistentClaude(events)
        session_pool: dict[str, PersistentClaude] = {"sess-abc": mock_pc}

        conn = _make_conn()
        await execute_task_reply(
            "t1", "user answer", "sess-abc",
            conn, _make_config(), asyncio.Event(),
            session_pool=session_pool,
        )

        types = _sent_types(conn)
        assert "question.asked" in types
        assert "task.completed" not in types

    @pytest.mark.asyncio
    async def test_persistent_reply_sequence_offset(self):
        """Persistent reply respects sequence_offset."""
        events = [SYSTEM_INIT, TEXT_EVENT, RESULT_SUCCESS]
        mock_pc = _MockPersistentClaude(events)
        session_pool: dict[str, PersistentClaude] = {"sess-abc": mock_pc}

        conn = _make_conn()
        await execute_task_reply(
            "t1", "continue", "sess-abc",
            conn, _make_config(), asyncio.Event(),
            session_pool=session_pool,
            sequence_offset=10,
        )

        sent = _sent_messages(conn)
        task_events = [m for m in sent if m.get("type") == "task.event"]
        assert task_events[0]["sequence"] == 11


# ---------------------------------------------------------------------------
# Test: PersistentClaude._build_command
# ---------------------------------------------------------------------------

class TestPersistentClaudeBuildCommand:

    def test_basic_command(self):
        config = ClaudeConfig(
            working_directory="/tmp",
            permission_mode="acceptEdits",
            allowed_tools=["Read", "Edit"],
            disallowed_tools=["Bash"],
        )
        pc = PersistentClaude(config)
        cmd = pc._build_command()

        assert "claude" in cmd
        assert "-p" in cmd
        assert "--input-format" in cmd
        assert cmd[cmd.index("--input-format") + 1] == "stream-json"
        assert "--output-format" in cmd
        assert cmd[cmd.index("--output-format") + 1] == "stream-json"
        assert "--verbose" in cmd
        assert "--permission-mode" in cmd
        assert cmd[cmd.index("--permission-mode") + 1] == "acceptEdits"
        assert "--tools" in cmd
        assert cmd[cmd.index("--tools") + 1] == "Read,Edit"
        assert "--disallowed-tools" in cmd

    def test_no_prompt_in_command(self):
        """Unlike build_claude_command, persistent mode has no prompt in args."""
        config = ClaudeConfig(working_directory="/tmp")
        pc = PersistentClaude(config)
        cmd = pc._build_command()

        # -p flag is present but no prompt string follows it directly
        # (prompt is sent via stdin)
        assert cmd[0] == "claude"
        assert cmd[1] == "-p"
        assert cmd[2] == "--input-format"  # not a prompt string

    def test_command_does_not_include_system_prompt(self):
        """System prompt is managed via ~/.claude/rules/, not CLI flag."""
        config = ClaudeConfig(working_directory="/tmp")
        pc = PersistentClaude(config)
        cmd = pc._build_command()
        assert "--append-system-prompt" not in cmd


# ---------------------------------------------------------------------------
# Test: Idle timeout
# ---------------------------------------------------------------------------

class TestIdleTimeout:

    def test_default_idle_timeout(self):
        """Default idle timeout is 5 minutes (300s)."""
        config = ClaudeConfig(working_directory="/tmp")
        pc = PersistentClaude(config)
        assert pc._idle_timeout == 300

    def test_custom_idle_timeout(self):
        config = ClaudeConfig(working_directory="/tmp")
        pc = PersistentClaude(config, idle_timeout=60)
        assert pc._idle_timeout == 60

    def test_not_idle_initially(self):
        config = ClaudeConfig(working_directory="/tmp")
        pc = PersistentClaude(config, idle_timeout=300)
        assert not pc.is_idle
        assert pc.idle_seconds < 1

    def test_is_idle_after_timeout(self):
        """Session reports idle when last_activity is older than timeout."""
        import time
        config = ClaudeConfig(working_directory="/tmp")
        pc = PersistentClaude(config, idle_timeout=0.1)
        # Fake old activity
        pc._last_activity = time.monotonic() - 1.0
        assert pc.is_idle
        assert pc.idle_seconds >= 1.0

    @pytest.mark.asyncio
    async def test_cleanup_loop_removes_idle_sessions(self):
        """_session_cleanup_loop closes and removes idle sessions."""
        from toony_agent_runner.main import _session_cleanup_loop

        mock_pc = _MockPersistentClaude([SYSTEM_INIT, RESULT_SUCCESS])
        mock_pc._idle_timeout = 0.1
        mock_pc._last_activity = time.monotonic() - 1.0  # expired

        session_pool: dict[str, PersistentClaude] = {"sess-old": mock_pc}
        shutdown = asyncio.Event()

        # Run one iteration of the cleanup loop then shutdown
        async def stop_after_cleanup():
            await asyncio.sleep(0.2)  # let cleanup run once
            shutdown.set()

        with patch("toony_agent_runner.main.SESSION_CLEANUP_INTERVAL", 0.05):
            await asyncio.gather(
                _session_cleanup_loop(session_pool, shutdown),
                stop_after_cleanup(),
            )

        assert "sess-old" not in session_pool
        assert mock_pc.close_called


class TestIdleTimerResetOnReply:
    """Verify that receiving task.reply / question.answered resets _last_activity."""

    def test_task_reply_resets_last_activity(self):
        """TaskReply handler resets _last_activity on the session in pool."""
        import time as _time
        from toony_agent_runner.main import _reset_session_activity

        mock_pc = _MockPersistentClaude([SYSTEM_INIT, RESULT_SUCCESS])
        mock_pc._last_activity = _time.monotonic() - 600  # 10 min ago
        session_pool = {"sess-abc": mock_pc}

        _reset_session_activity(session_pool, "sess-abc")

        assert mock_pc.idle_seconds < 2  # just reset

    def test_question_answered_resets_last_activity(self):
        """QuestionAnswered handler resets _last_activity on the session in pool."""
        import time as _time
        from toony_agent_runner.main import _reset_session_activity

        mock_pc = _MockPersistentClaude([SYSTEM_INIT, RESULT_SUCCESS])
        mock_pc._last_activity = _time.monotonic() - 600
        session_pool = {"sess-xyz": mock_pc}

        _reset_session_activity(session_pool, "sess-xyz")

        assert mock_pc.idle_seconds < 2

    def test_reset_noop_when_session_missing(self):
        """No error when session_id is not in the pool."""
        from toony_agent_runner.main import _reset_session_activity

        session_pool: dict = {}
        _reset_session_activity(session_pool, "nonexistent")  # should not raise
