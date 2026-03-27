# Fix session_idle_timeout — Design

**Issue:** TOD-16
**Date:** 2026-03-26
**Status:** Approved

## Problem

Persistent sessions are closed by the idle cleanup loop without considering whether the session is waiting for user input. When Claude asks a question (via `AskUserQuestion` or TOONY marker), the session enters the pool with `_last_activity` set to the moment the question was asked. If the user takes longer than `session_idle_timeout` (default 300s) to reply, the cleanup loop closes the session. The reply then falls back to the slower `--resume` approach (new process).

## Root Cause

`PersistentClaude._last_activity` is only updated inside `send_message()` — when a message is sent (line 502) and when a result is received (line 524). There is no activity reset when a `task.reply` or `question.answered` WebSocket message arrives in `main.py`.

## Chosen Approach: Reset `_last_activity` on WS message arrival

When `main.py` receives a `TaskReply` or `QuestionAnswered` message, immediately reset `_last_activity` on the corresponding session in the pool before any async work.

### Changes

**Single file: `toony_agent_runner/toony_agent_runner/main.py`**

In the `TaskReply` handler (after `_cleanup_finished_tasks()`):
```python
_pc = session_pool.get(msg.session_id)
if _pc:
    _pc._last_activity = time.monotonic()
```

In the `QuestionAnswered` handler (after `_cleanup_finished_tasks()`):
```python
_pc = session_pool.get(msg.session_id)
if _pc:
    _pc._last_activity = time.monotonic()
```

### Behavior

- Reply arrives **before** idle timeout fires: `_last_activity` is reset, session survives the next cleanup cycle, reply processed on persistent session.
- Reply arrives **after** idle timeout fires: session already closed by cleanup loop, `session_pool.get()` returns `None`, no reset, fallback to `--resume` (unchanged from current behavior).

### Known Limitation

This does not fully prevent session closure for users who consistently take longer than `session_idle_timeout` to reply. For those cases, increase `claude.session_idle_timeout` in `config.yml`.

### Alternatives Considered

1. **`_awaiting_reply` flag**: Add a flag to skip awaiting sessions in cleanup. Fully prevents premature closure but risks process leaks if user never replies (needs hard cap).
2. **Separate reply timeout**: Use a longer configurable timeout for awaiting sessions. Most flexible but adds config complexity.

Both were rejected in favor of the simpler approach for now.
