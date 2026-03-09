# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`toony_agent_runner` is a Python asyncio daemon that bridges Claude Code with the Toony Dev Core backend. It connects via WebSocket, receives task assignments, executes them by spawning the Claude CLI (`claude -p --output-format stream-json`), streams events in real-time, handles question/answer flows, and reports task completion/failure.

## Commands

```bash
# Install (editable, from toony_agent_runner/ directory)
pip install -e .

# Run
toony-agent-runner --config config.yml
toony-agent-runner --config config.yml --verbose   # debug logging

# Configuration: copy config.example.yml -> config.yml, set api_key
# For MAX plan auth: run `claude setup-token` and set oauth_token in config or CLAUDE_CODE_OAUTH_TOKEN env var

# Tests (requires toony_agent_runner_venv pyenv virtualenv)
PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest tests/ -v          # all tests
PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest tests/test_multitask.py -v  # single file
PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest tests/test_multitask.py::TestConfigMaxConcurrentTasks::test_default_is_one -v  # single test
```

Python 3.11+ required. Dependencies: `websockets>=12.0`, `pyyaml>=6.0`. Requires `claude` CLI installed and available on PATH.

## Architecture

Modules with clear separation of concerns:

```
main.py --- Orchestrator: CLI entry, config loading, main event loop, message dispatch
  |
  |-- task_executor.py --- Spawns Claude CLI via cli_executor, streams events back to backend,
  |                         handles question detection and task completion/failure
  |
  |-- cli_executor.py --- Builds CLI commands, spawns `claude -p --output-format stream-json` subprocess,
  |                        yields parsed JSON events, extracts questions/tools/text from assistant events
  |
  |-- connection.py --- BackendConnection: WebSocket client, reconnection w/ exponential backoff, message buffering
  |
  +-- protocol.py --- Dataclass message types with to_json() serialization
  |                    Outgoing: Register, Heartbeat, TaskAccepted, TaskEvent, QuestionAsked, TaskCompleted, TaskFailed
  |                    Incoming: TaskAssign, QuestionAnswered, TaskCancel, TaskReply, HeartbeatAck
  |
  +-- commands/         --- Command execution: registry of filesystem/download/git/script handlers,
                             sandboxed to working_directory, dispatched independently of Claude tasks
```

### Lifecycle Flow

1. Load YAML config -> connect WebSocket (API key via `?key=` query param) -> send `register` with host metadata
2. Idle loop: send heartbeats every 30s, wait for `task.assign`
3. On task: spawn `claude -p --output-format stream-json` subprocess -> parse JSON lines from stdout -> send `task.event` messages
4. If `AskUserQuestion` tool detected in assistant event: send `question.asked` to backend, CLI finishes (task stays WAITING_FOR_ANSWER)
5. On `question.answered`: resume conversation via `claude -p --resume <session_id>` with the user's answer
6. CLI exits with result event -> send `task.completed` or `task.failed`
7. On `command.execute`: look up `command_key` in `COMMAND_REGISTRY`, execute handler with args (sandboxed to `working_dir`), send `command.result` with success/error
8. On SIGINT/SIGTERM: terminate CLI processes, close connection, exit

### Key Design Decisions

- **Direct CLI invocation**: Uses `claude -p --output-format stream-json` subprocess instead of the Claude Agent SDK. The CLI loads skills from `~/.claude/skills/` and `~/.agents/skills/`, which the SDK does not support.
- **Question/answer via AskUserQuestion detection**: The runner detects `AskUserQuestion` tool_use blocks in assistant stream events. When found, it sends `question.asked` to the backend and lets the CLI finish. The user's answer arrives as `question.answered`, which resumes the session via `--resume`.
- **Message buffering**: When WebSocket disconnects mid-task, `BackendConnection` buffers messages in a `deque` and flushes on reconnect. The CLI continues executing during disconnection.
- **Concurrent task execution**: Runner supports `max_concurrent_tasks` (default 1). Task state (`active_tasks`, `cancel_events`) is keyed by `task_id`. Tasks beyond capacity are ignored (stay QUEUED on backend).

### WebSocket Protocol

All messages are JSON with a `type` field. Authentication is via `?key=tok_ta_...` query parameter (API key generated in Toony web UI).

| Direction | Type | Purpose |
|-----------|------|---------|
| Out | `register` | Identify runner (hostname, platform, version, pid) |
| Out | `heartbeat` | Keepalive (30s interval) |
| Out | `task.accepted` | Acknowledge task receipt |
| Out | `task.event` | Stream Claude event (with sequence number) |
| Out | `question.asked` | Relay AskUserQuestion to user |
| Out | `task.completed` / `task.failed` | Final status |
| In | `task.assign` | Backend assigns task (task_id, title, prompt) |
| In | `task.cancel` | Request task cancellation |
| In | `task.reply` | Resume conversation with session_id |
| In | `question.answered` | User's answer to a question |
| In | `command.execute` | Backend sends a direct command (key + args) |
| Out | `command.result` | Runner reports command execution result |
| In | `heartbeat.ack` | Backend acknowledges heartbeat |
