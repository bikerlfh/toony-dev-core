# Session Idle Timeout Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reset `_last_activity` on persistent sessions when `task.reply` or `question.answered` WebSocket messages arrive, so the idle cleanup loop doesn't prematurely close sessions waiting for user input.

**Architecture:** Two-line fix in `main.py` — touch `_last_activity` on the session immediately when the reply message is received, before any async dispatch. Requires adding `import time` to `main.py`.

**Tech Stack:** Python 3.11+, asyncio, pytest

---

### Task 1: Write failing tests for idle timer reset on reply

**Files:**
- Modify: `toony_agent_runner/tests/test_persistent_session.py`

**Step 1: Write the failing tests**

Add a new test class at the end of the file, after `TestIdleTimeout`:

```python
class TestIdleTimerResetOnReply:
    """Verify that receiving task.reply / question.answered resets _last_activity."""

    def test_task_reply_resets_last_activity(self):
        """TaskReply handler resets _last_activity on the session in pool."""
        import time as _time
        from toony_agent_runner.main import _reset_session_activity

        mock_pc = _MockPersistentClaude([SYSTEM_INIT, RESULT_SUCCESS])
        mock_pc._last_activity = _time.monotonic() - 600  # 10 min ago — well past timeout
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
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_persistent_session.py::TestIdleTimerResetOnReply -v`

Expected: FAIL — `ImportError: cannot import name '_reset_session_activity' from 'toony_agent_runner.main'`

**Step 3: Commit**

```bash
git add toony_agent_runner/tests/test_persistent_session.py
git commit -m "test(toony-agents): add failing tests for idle timer reset on reply"
```

---

### Task 2: Implement the fix

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/main.py`

**Step 1: Add `import time` to the imports block**

At `main.py:22` (after `import signal`), add:

```python
import time
```

**Step 2: Add the `_reset_session_activity` helper**

Add this function right before `_session_cleanup_loop` (around line 498, before the `async def _session_cleanup_loop` definition):

```python
def _reset_session_activity(
    session_pool: dict[str, PersistentClaude],
    session_id: str | None,
) -> None:
    """Reset idle timer on a session so the cleanup loop won't close it."""
    if session_id:
        pc = session_pool.get(session_id)
        if pc:
            pc._last_activity = time.monotonic()
```

**Step 3: Call the helper in the TaskReply handler**

In the `TaskReply` handler (line ~258), add the call right after `_cleanup_finished_tasks()`:

```python
            elif isinstance(msg, TaskReply):
                _cleanup_finished_tasks()
                _reset_session_activity(session_pool, msg.session_id)
```

**Step 4: Call the helper in the QuestionAnswered handler**

In the `QuestionAnswered` handler (line ~296), add the call right after `_cleanup_finished_tasks()`:

```python
            elif isinstance(msg, QuestionAnswered):
                _cleanup_finished_tasks()
                _reset_session_activity(session_pool, msg.session_id)
```

**Step 5: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_persistent_session.py::TestIdleTimerResetOnReply -v`

Expected: 3 passed

**Step 6: Run full test suite to verify no regressions**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`

Expected: All tests pass

**Step 7: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/main.py
git commit -m "fix(toony-agents): reset idle timer on task.reply and question.answered

- Add _reset_session_activity helper to main.py
- Call it in TaskReply and QuestionAnswered handlers before dispatch
- Prevents premature session closure while user is composing a reply"
```
