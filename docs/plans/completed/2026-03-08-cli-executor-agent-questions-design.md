# Design: CLI Executor + Agent Questions

**Date:** 2026-03-08
**Status:** Approved

## Overview

Replace `claude_agent_sdk` with direct CLI invocation (`claude -p`) via `asyncio.create_subprocess_exec`, and transform the approval gate system into a conversational question/answer system between agent and user.

## Motivation

- The `claude_agent_sdk` (`ClaudeSDKClient`) does not load Claude Code skills (brainstorming, systematic-debugging, writing-plans, etc.) when running tasks
- Verified that `claude -p` (print mode) **does** load all 19 skills from `~/.claude/skills/`
- The current "approval gate" concept is too narrow — `AskUserQuestion` is a general-purpose tool for any question, not just approvals

## Architecture

```
Backend (Django)                    Runner (Python)                   CLI (claude)

task.assign ──────────────────►  run_claude(-p, prompt)  ──────►  claude -p "..."
                                       │                            --stream-json
                                       │ parse stdout               --session-id X
                                       │
task.event ◄──────────────────  stream events (tool_use,          stdout lines
                                 text, etc.)
                                       │
                                  detect AskUserQuestion
                                       │
question.asked ◄──────────────  send question + metadata
                                       │
   User answers in UI                  │ (process ends)
                                       │
question.answered ────────────►  run_claude(-p, answer,  ──────►  claude -p "..."
                                   --resume session_id)             --resume SID
                                       │
task.completed ◄──────────────  ResultMessage
```

## 1. Runner: CLI Wrapper

### New module: `cli_executor.py`

Replaces SDK integration with direct CLI invocation:

```python
async def run_claude(
    prompt: str,
    cwd: str,
    session_id: str | None = None,
    resume: bool = False,
    config: ClaudeConfig,
) -> AsyncIterator[dict]:
    cmd = ["claude", "-p", prompt,
           "--output-format", "stream-json"]

    if resume and session_id:
        cmd.extend(["--resume", session_id])
    elif session_id:
        cmd.extend(["--session-id", session_id])

    cmd.extend(["--permission-mode", config.permission_mode])

    if config.allowed_tools:
        cmd.extend(["--tools", ",".join(config.allowed_tools)])

    if config.disallowed_tools:
        cmd.extend(["--disallowed-tools", " ".join(config.disallowed_tools)])

    env = _build_env(config)

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=PIPE, stderr=PIPE, cwd=cwd, env=env
    )

    async for line in proc.stdout:
        event = json.loads(line.decode().strip())
        yield event

    await proc.wait()
```

### Changes to `task_executor.py`

- Use `run_claude()` instead of `ClaudeSDKClient`
- Event loop parses stream JSON looking for:
  - `assistant` events with `tool_use` where `name == "AskUserQuestion"` → emit `question.asked`, save `session_id`, return
  - `result` events → emit `task.completed` or `task.failed`
  - Other events → emit `task.event` to backend
- `execute_task_reply()` simplifies to: `run_claude(answer, resume=True, session_id=sid)`

### Modules deleted

- `sdk_helpers.py` — no longer needed (hooks, `_build_sdk_options`, `_auto_approve_tool`)

### Modules modified

- `stream_parser.py` — adapt classification to CLI JSON format instead of SDK `StreamEvent`
- `config.py` — add `disallowed_tools`, remove SDK-specific fields
- `protocol.py` — rename `ApprovalNeeded` → `QuestionAsked`, `ApprovalResponse` → `QuestionAnswered`
- `main.py` — rename message handlers, `approval.response` → `question.answered`
- `connection.py` — rename `pending_approvals` → `pending_questions`

## 2. WebSocket Protocol Changes

### Renamed messages

| Current | New |
|---|---|
| `approval.needed` | `question.asked` |
| `approval.response` | `question.answered` |

### `question.asked` payload (runner → backend)

```json
{
  "type": "question.asked",
  "task_id": "uuid",
  "session_id": "uuid",
  "question_id": "uuid",
  "question": {
    "text": "¿Qué framework prefieres para el frontend?",
    "type": "free_text"
  }
}
```

### `question.answered` payload (backend → runner)

```json
{
  "type": "question.answered",
  "task_id": "uuid",
  "question_id": "uuid",
  "answer": "React con Next.js"
}
```

All other messages unchanged: `task.assign`, `task.reply`, `task.cancel`, `task.event`, `task.completed`, `task.failed`, `heartbeat`, `register`, `config.sync`, `command.execute`.

## 3. Backend: Model and API

### New model: `AgentTaskQuestion`

```python
class AgentTaskQuestion(BaseModel):  # UUID pk, created_at, updated_at
    task = models.ForeignKey(AgentTask, related_name="questions", on_delete=models.CASCADE)
    question_id = models.UUIDField(unique=True)
    text = models.TextField()
    answer = models.TextField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    session_id = models.CharField(max_length=255)
```

### Changes to `AgentTask` model

- Add `WAITING_FOR_ANSWER` to status choices (alongside `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`)
- Remove approval-specific fields if any exist

### Flow

1. Runner sends `question.asked` → consumer creates `AgentTaskQuestion`, sets task status to `WAITING_FOR_ANSWER`, broadcasts to frontend via WebSocket
2. User answers in UI → API endpoint receives answer → updates `AgentTaskQuestion` (answer, answered_at) → sets task status to `RUNNING` → sends `question.answered` to runner via WebSocket
3. Runner does `--resume` with the answer → execution continues

### New endpoint

- `POST /api/toony-agents/tasks/{task_id}/answer/` — receives `{ question_id, answer }` from frontend

## 4. Frontend: Conversational Card

### New component: `AgentQuestionCard`

When task status is `WAITING_FOR_ANSWER`:

```
┌─────────────────────────────────────────┐
│  🤖 Agent Question                      │
│                                         │
│  ¿Qué framework prefieres para el       │
│  frontend?                              │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Type your answer...               │  │
│  └───────────────────────────────────┘  │
│                              [ Send ]   │
│                                         │
│  ── Previous questions ──               │
│  Q: ¿Usamos TypeScript?                 │
│  A: Sí, con strict mode        2m ago   │
└─────────────────────────────────────────┘
```

### Behavior

- Free text input — user answers whatever they want
- History of previous Q&A for the same task (list of `AgentTaskQuestion`)
- On send, calls `POST /api/toony-agents/tasks/{task_id}/answer/`
- Card disappears when task returns to `RUNNING`
- Real-time notification via WebSocket when a new question arrives

### Changes

- Delete approval card component (Approve/Deny buttons)
- New `AgentQuestionCard` with text input
- Update task detail page to show Q&A history
- Update WebSocket handler to listen for `question.asked` instead of `approval.needed`

## 5. Dependencies

### Removed

- `claude-agent-sdk` — replaced by `asyncio.create_subprocess_exec` + `claude` CLI

### Added

- None (uses stdlib only)

## 6. Risks

- CLI stream JSON format could change between versions — mitigate with integration tests and minimum version pin
- ~1-2s latency per resume on question/answer cycles — acceptable for the use case

## 7. Components Impact Summary

| Component | Action |
|---|---|
| `cli_executor.py` | **New** — async CLI wrapper |
| `sdk_helpers.py` | **Delete** |
| `task_executor.py` | **Modify** — use cli_executor |
| `stream_parser.py` | **Modify** — parse CLI JSON |
| `protocol.py` | **Modify** — rename approval → question |
| `main.py` | **Modify** — question.answered handlers |
| `connection.py` | **Modify** — pending_questions |
| `config.py` | **Modify** — add disallowed_tools, remove SDK fields |
| `AgentTaskQuestion` model | **New** |
| `AgentTask` model | **Modify** — WAITING_FOR_ANSWER status |
| Consumer WebSocket | **Modify** — question.asked/answered |
| API endpoint | **New** — POST .../answer/ |
| `AgentQuestionCard` | **New** — conversational component |
| Approval card | **Delete** |
| Task detail page | **Modify** — Q&A history |
| `pyproject.toml` | **Modify** — remove claude-agent-sdk dependency |
