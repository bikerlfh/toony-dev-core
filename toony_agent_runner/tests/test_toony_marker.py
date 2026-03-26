"""Tests for the TOONY marker protocol (extract_toony_marker)."""

import asyncio
import time

import pytest
from unittest.mock import AsyncMock, patch

from toony_agent_runner.cli_executor import PersistentClaude, extract_toony_marker
from toony_agent_runner.task_executor import execute_task
from toony_agent_runner.config import ClaudeConfig, RunnerConfig


class TestExtractToonyMarker:
    """Unit tests for extract_toony_marker()."""

    def test_no_marker_returns_none(self):
        """Plain text without a marker returns (None, original_text)."""
        text = "Here is a normal response with no markers."
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_question_free_text(self):
        """A question marker with type=free_text is extracted and stripped."""
        payload = '{"action":"question","text":"What is the DB host?","type":"free_text"}'
        text = f"Some preamble.\n<!--TOONY:{payload}-->\nSome epilogue."
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["text"] == "What is the DB host?"
        assert marker["type"] == "free_text"
        assert "<!--TOONY:" not in cleaned
        assert "Some preamble." in cleaned
        assert "Some epilogue." in cleaned

    def test_question_with_options(self):
        """A question marker with options, header, and multi_select is parsed."""
        payload = (
            '{"action":"question","text":"Pick a DB",'
            '"header":"Database Selection",'
            '"options":["postgres","mysql","sqlite"],'
            '"multi_select":true}'
        )
        text = f"<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["header"] == "Database Selection"
        assert marker["options"] == ["postgres", "mysql", "sqlite"]
        assert marker["multi_select"] is True
        assert cleaned == ""

    def test_finish_with_summary(self):
        """A finish marker with a summary is extracted."""
        payload = '{"action":"finish","summary":"All tasks completed successfully."}'
        text = f"Done!\n<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "finish"
        assert marker["summary"] == "All tasks completed successfully."
        assert "Done!" in cleaned
        assert "<!--TOONY:" not in cleaned

    def test_finish_without_summary(self):
        """A finish marker without a summary is extracted."""
        payload = '{"action":"finish"}'
        text = f"<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "finish"
        assert "summary" not in marker
        assert cleaned == ""

    def test_invalid_json_returns_none(self):
        """Invalid JSON inside the marker returns (None, original_text)."""
        text = "<!--TOONY:not-valid-json-->"
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_missing_action_returns_none(self):
        """JSON without an 'action' key returns (None, original_text)."""
        text = '<!--TOONY:{"foo":"bar"}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_marker_in_middle_of_text(self):
        """A marker between text blocks is extracted; surrounding text preserved."""
        payload = '{"action":"question","text":"Continue?"}'
        text = f"Before marker.<!--TOONY:{payload}-->After marker."
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["text"] == "Continue?"
        assert cleaned == "Before marker.After marker."

    def test_question_defaults(self):
        """A question marker missing 'type' still parses; type key is absent."""
        payload = '{"action":"question","text":"Your name?"}'
        text = f"<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["text"] == "Your name?"
        # type key not present — caller should default to free_text
        assert "type" not in marker


# ---------------------------------------------------------------------------
# Integration tests: TOONY markers in execute_task (_process_events)
# ---------------------------------------------------------------------------


def _make_config() -> RunnerConfig:
    return RunnerConfig(backend_url="ws://localhost", api_key="test",
                        claude=ClaudeConfig(working_directory="/tmp"))

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
        self._last_activity = time.monotonic()
        self.messages_sent = []
        self.close_called = False

    @property
    def session_id(self): return self._session_id
    @property
    def is_alive(self): return self._alive
    @property
    def idle_seconds(self): return time.monotonic() - self._last_activity
    @property
    def is_idle(self): return self.idle_seconds >= self._idle_timeout

    async def start(self): pass
    async def close(self):
        self.close_called = True
        self._alive = False
    async def send_message(self, content):
        self.messages_sent.append(content)
        for e in self._events:
            yield e


SYSTEM_INIT = {"type": "system", "subtype": "init", "session_id": "sess-m1"}


class TestMarkerQuestionInExecuteTask:

    @pytest.mark.asyncio
    async def test_question_marker_sends_question_asked(self):
        events = [SYSTEM_INIT, {
            "type": "result", "is_error": False, "session_id": "sess-m1",
            "result": 'What do you think?\n<!--TOONY:{"action":"question","text":"Pick a DB","type":"options","options":[{"label":"Postgres"},{"label":"MySQL"}]}-->',
        }]
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
        events = [SYSTEM_INIT, {
            "type": "result", "is_error": False, "session_id": "sess-m1",
            "result": '<!--TOONY:{"action":"question","text":"Name?"}-->',
        }]
        mock_pc = _MockPC(events)
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", _make_conn(), _make_config(), asyncio.Event(), session_pool=pool)

        assert "sess-m1" in pool
        assert not mock_pc.close_called


class TestMarkerFinishInExecuteTask:

    @pytest.mark.asyncio
    async def test_finish_marker_sends_completed(self):
        events = [SYSTEM_INIT, {
            "type": "result", "is_error": False, "session_id": "sess-m1",
            "result": 'All done.\n<!--TOONY:{"action":"finish","summary":"Added endpoint"}-->',
        }]
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
        events = [SYSTEM_INIT, {
            "type": "result", "is_error": False, "session_id": "sess-m1",
            "result": '<!--TOONY:{"action":"finish"}-->',
        }]
        mock_pc = _MockPC(events)
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", _make_conn(), _make_config(), asyncio.Event(), session_pool=pool)

        assert "sess-m1" not in pool
        assert mock_pc.close_called


class TestNoMarkerBehavior:

    @pytest.mark.asyncio
    async def test_no_marker_sends_completed_keeps_session(self):
        events = [SYSTEM_INIT, {
            "type": "result", "is_error": False, "session_id": "sess-m1",
            "result": "Here is my analysis.",
        }]
        mock_pc = _MockPC(events)
        conn = _make_conn()
        pool: dict[str, PersistentClaude] = {}

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", conn, _make_config(), asyncio.Event(), session_pool=pool)

        types = _sent_types(conn)
        assert "task.completed" in types
        assert "sess-m1" in pool


class TestMarkerStrippedFromResult:

    @pytest.mark.asyncio
    async def test_finish_marker_stripped_from_result_text(self):
        events = [SYSTEM_INIT, {
            "type": "result", "is_error": False, "session_id": "sess-m1",
            "result": 'All done.\n<!--TOONY:{"action":"finish","summary":"x"}-->',
        }]
        mock_pc = _MockPC(events)
        conn = _make_conn()

        with patch("toony_agent_runner.task_executor.PersistentClaude", return_value=mock_pc):
            await execute_task("t1", "do it", conn, _make_config(), asyncio.Event())

        sent = _sent_messages(conn)
        completed = next(m for m in sent if m["type"] == "task.completed")
        assert "<!--TOONY:" not in completed["result"]
        assert "All done." in completed["result"]
