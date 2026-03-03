# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`toony_agent_runner` is a Python asyncio daemon that bridges Claude Code CLI with the Toony Dev Core backend. It connects via WebSocket, receives task assignments, spawns Claude CLI subprocesses, streams execution events in real-time, handles approval gates, and reports task completion/failure.

## Commands

```bash
# Install (editable, from toony_agent_runner/ directory)
pip install -e .

# Run
toony-agent-runner --config config.yml
toony-agent-runner --config config.yml --verbose   # debug logging

# Configuration: copy config.example.yml → config.yml, set api_key
```

Python 3.11+ required. Dependencies: `websockets>=12.0`, `pyyaml>=6.0`.

## Architecture

Five modules with clear separation of concerns:

```
main.py ─── Orchestrator: CLI entry, config loading, main event loop, task execution
  │
  ├── connection.py ─── BackendConnection: WebSocket client, reconnection w/ exponential backoff, message buffering
  │
  ├── claude_process.py ─── ClaudeProcess: spawns `claude --output-format stream-json -p <prompt>`,
  │                          streams stdout events, drains stderr, SIGTERM/SIGKILL cancellation
  │
  ├── stream_parser.py ─── Parses stream-json lines, detects AskUserQuestion approval gates,
  │                         classifies events (LOG/TOOL_USE/TOOL_RESULT/ERROR/STATUS_CHANGE),
  │                         extracts event data with tool-specific key filtering
  │
  └── protocol.py ─── Dataclass message types with to_json() serialization
                       Outgoing: Register, Heartbeat, TaskAccepted, TaskEvent, ApprovalNeeded, TaskCompleted, TaskFailed
                       Incoming: TaskAssign, ApprovalResponse, TaskCancel, HeartbeatAck
```

### Lifecycle Flow

1. Load YAML config → connect WebSocket (API key via `?key=` query param) → send `register` with host metadata
2. Idle loop: send heartbeats every 30s, wait for `task.assign`
3. On task: spawn Claude subprocess → stream stdout events → send `task.event` messages with sequence numbers
4. If `AskUserQuestion` tool detected: send `approval.needed`, await `approval.response` from backend, write to stdin (or SIGTERM on reject)
5. Claude exits: send `task.completed` (code 0) or `task.failed` (non-zero)
6. On SIGINT/SIGTERM: cancel active task, close connection, exit

### Key Design Decisions

- **stdin is DEVNULL**: `claude_process.py:84` opens stdin as `DEVNULL` to prevent Claude CLI from hanging. The `send_input()` method exists but is a no-op until approval-gate stdin support is added (switch to `PIPE` conditionally).
- **Message buffering**: When WebSocket disconnects mid-task, `BackendConnection` buffers messages in a `deque` and flushes on reconnect. Claude keeps running during disconnection.
- **Single-task execution**: Runner processes one task at a time. A second `task.assign` while busy is logged and ignored.
- **Approval futures**: Stored as `conn._pending_approval` (dynamically attached attribute) — resolved by the main message loop when `approval.response` arrives.

### WebSocket Protocol

All messages are JSON with a `type` field. Authentication is via `?key=tok_ta_...` query parameter (API key generated in Toony web UI).

| Direction | Type | Purpose |
|-----------|------|---------|
| Out | `register` | Identify runner (hostname, platform, version, pid) |
| Out | `heartbeat` | Keepalive (30s interval) |
| Out | `task.accepted` | Acknowledge task receipt |
| Out | `task.event` | Stream Claude event (with sequence number) |
| Out | `approval.needed` | Relay AskUserQuestion to user |
| Out | `task.completed` / `task.failed` | Final status |
| In | `task.assign` | Backend assigns task (task_id, title, prompt) |
| In | `task.cancel` | Request task cancellation |
| In | `approval.response` | User approve/reject decision |
| In | `heartbeat.ack` | Backend acknowledges heartbeat |

### Stream-JSON Event Classification

`stream_parser.py` classifies Claude's `--output-format stream-json` events:
- `system` → STATUS_CHANGE
- `result` → ERROR (on error subtypes) or STATUS_CHANGE
- `assistant` → TOOL_USE (if contains tool_use blocks) or LOG
- `content_block_start` → TOOL_USE or LOG
- `tool_result` → TOOL_RESULT
- Approval gate detection: checks three shapes for `AskUserQuestion` tool_use (assistant message, content_block_start, top-level)
