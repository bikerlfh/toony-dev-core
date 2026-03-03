# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`toony_agent_runner` is a Python asyncio daemon that bridges Claude Code with the Toony Dev Core backend. It connects via WebSocket, receives task assignments, executes them via the Claude Agent SDK, streams events in real-time, handles approval gates natively, and reports task completion/failure.

## Commands

```bash
# Install (editable, from toony_agent_runner/ directory)
pip install -e .

# Run
toony-agent-runner --config config.yml
toony-agent-runner --config config.yml --verbose   # debug logging

# Configuration: copy config.example.yml -> config.yml, set api_key
# For MAX plan auth: run `claude setup-token` and set oauth_token in config or CLAUDE_CODE_OAUTH_TOKEN env var
```

Python 3.11+ required. Dependencies: `websockets>=12.0`, `pyyaml>=6.0`, `claude-agent-sdk>=0.1.40`.

## Architecture

Four modules with clear separation of concerns:

```
main.py --- Orchestrator: CLI entry, config loading, main event loop, task execution via SDK
  |
  |-- connection.py --- BackendConnection: WebSocket client, reconnection w/ exponential backoff, message buffering
  |
  |-- stream_parser.py --- Classifies SDK StreamEvent objects (LOG/TOOL_USE/TOOL_RESULT/ERROR/STATUS_CHANGE),
  |                         extracts event data with tool-specific key filtering
  |
  +-- protocol.py --- Dataclass message types with to_json() serialization
                       Outgoing: Register, Heartbeat, TaskAccepted, TaskEvent, ApprovalNeeded, TaskCompleted, TaskFailed
                       Incoming: TaskAssign, ApprovalResponse, TaskCancel, TaskReply, HeartbeatAck
```

### Lifecycle Flow

1. Load YAML config -> connect WebSocket (API key via `?key=` query param) -> send `register` with host metadata
2. Idle loop: send heartbeats every 30s, wait for `task.assign`
3. On task: create `ClaudeSDKClient` with `can_use_tool` callback -> stream `StreamEvent` objects -> send `task.event` messages
4. If `AskUserQuestion` tool called: SDK fires `can_use_tool` callback -> runner sends `approval.needed` to backend, awaits `approval.response`, returns `PermissionResultAllow`/`PermissionResultDeny`
5. SDK finishes: `ResultMessage` received -> send `task.completed` or `task.failed`
6. On SIGINT/SIGTERM: interrupt SDK client, close connection, exit

### Key Design Decisions

- **Claude Agent SDK**: Uses `ClaudeSDKClient` (streaming mode with interrupt support) for task execution and session resume via `ClaudeAgentOptions(resume=session_id)` for task replies.
- **Approval gates via can_use_tool**: The SDK's `can_use_tool` callback fires when Claude calls `AskUserQuestion`. The callback bridges to the backend WebSocket, awaits user response, and returns the SDK's `PermissionResultAllow`/`PermissionResultDeny`.
- **Message buffering**: When WebSocket disconnects mid-task, `BackendConnection` buffers messages in a `deque` and flushes on reconnect. The SDK continues executing during disconnection.
- **Single-task execution**: Runner processes one task at a time. A second `task.assign` while busy is logged and ignored.

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
| In | `task.reply` | Resume conversation with session_id |
| In | `approval.response` | User approve/reject decision |
| In | `heartbeat.ack` | Backend acknowledges heartbeat |
