# toony_agent_runner

Python asyncio daemon that connects a ToonyAgent bot to the Toony Dev Core backend. It receives tasks via WebSocket, executes them via the Claude Agent SDK, streams events in real-time, and handles interactive approval gates.

## Requirements

- Python 3.11+
- Claude Code CLI installed and available in `$PATH`
- Network access to the Toony Dev Core backend

## Installation

```bash
cd toony_agent_runner
pip install -e .
```

This installs the `toony-agent-runner` CLI command.

## Quick Start

1. **Register a ToonyAgent** in the Toony Dev Core web UI (`/toony-agents/` page) or via API:

   ```bash
   curl -X POST https://your-backend/api/v1/organizations/<org-slug>/toony-agents/ \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -d '{"name": "My Bot", "slug": "my-bot"}'
   ```

2. **Generate an API key** (shown once — copy it immediately):

   ```bash
   curl -X POST https://your-backend/api/v1/organizations/<org-slug>/toony-agents/my-bot/keys/ \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -d '{"name": "dev-key"}'
   ```

   Response includes `raw_key: "tok_ta_..."` — save this value.

3. **Create the config file**:

   ```bash
   cp config.example.yml config.yml
   ```

   Edit `config.yml`:

   ```yaml
   backend_url: "ws://your-backend:8000/ws/toony-agents/runner/"
   api_key: "tok_ta_YOUR_KEY_HERE"

   claude:
     working_directory: "/path/to/your/project"
     max_task_timeout: 3600
     approval_timeout: 600
     # oauth_token: ""  # or set CLAUDE_CODE_OAUTH_TOKEN env var
     permission_mode: "acceptEdits"

   reconnect:
     max_retries: -1
     backoff_base: 1
     backoff_max: 30
   ```

4. **Start the runner**:

   ```bash
   toony-agent-runner --config config.yml
   ```

   The bot status changes to **ONLINE** in the web UI.

5. **Create a task** from the web UI and watch it execute in real-time.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `backend_url` | `ws://localhost:8000/ws/toony-agents/runner/` | WebSocket endpoint for backend communication |
| `api_key` | (required) | API key generated from the web UI. Starts with `tok_ta_` |
| `claude.working_directory` | `.` | Directory where Claude executes tasks |
| `claude.max_task_timeout` | `3600` | Max seconds per task before timeout |
| `claude.approval_timeout` | `600` | Max seconds to wait for user approval response |
| `claude.oauth_token` | `""` | OAuth token for MAX plan auth (or set `CLAUDE_CODE_OAUTH_TOKEN` env var) |
| `claude.permission_mode` | `acceptEdits` | SDK permission mode |
| `claude.allowed_tools` | (all) | List of tools Claude can use |
| `reconnect.max_retries` | `-1` | Max reconnection attempts. `-1` = unlimited |
| `reconnect.backoff_base` | `1` | Initial backoff delay in seconds |
| `reconnect.backoff_max` | `30` | Maximum backoff delay in seconds |

## CLI Usage

```
toony-agent-runner [--config PATH] [--verbose]

Options:
  --config PATH   Path to YAML config file (default: config.yml)
  --verbose, -v   Enable debug logging
```

## Architecture

The runner is a single-threaded asyncio daemon with these components:

```
toony_agent_runner/
├── main.py            # Entry point, lifecycle, task execution via Claude Agent SDK
├── connection.py      # WebSocket client with reconnection + message buffering
├── stream_parser.py   # Classify SDK StreamEvent objects, extract event data
└── protocol.py        # Message type definitions + serialization
```

### Lifecycle

```
START
  ├─ Load config from YAML
  ├─ Connect to backend via WebSocket (API key auth)
  ├─ Send "register" with metadata (hostname, platform, version, PID)
  │
  ├─ IDLE LOOP
  │    ├─ Send heartbeat every 30s
  │    ├─ Wait for messages from backend
  │    │
  │    ├─ On "task.assign":
  │    │    ├─ Send "task.accepted"
  │    │    ├─ Create ClaudeSDKClient with can_use_tool callback
  │    │    │
  │    │    ├─ STREAM LOOP (receive SDK events):
  │    │    │    ├─ StreamEvent → classify, extract data, send "task.event"
  │    │    │    └─ ResultMessage → send "task.completed" or "task.failed"
  │    │    │
  │    │    └─ If AskUserQuestion tool called (via can_use_tool):
  │    │         ├─ Send "approval.needed" to backend
  │    │         ├─ Wait for "approval.response" from user
  │    │         ├─ On approve: return PermissionResultAllow
  │    │         └─ On reject: return PermissionResultDeny
  │    │
  │    ├─ On "task.cancel": interrupt SDK client
  │    └─ On disconnect: reconnect with exponential backoff
  │
  └─ On SIGINT/SIGTERM: interrupt SDK client, close connection, exit
```

### Resiliency

| Scenario | Behavior |
|----------|----------|
| WebSocket disconnects during task | SDK keeps executing, runner buffers events, reconnects, flushes buffer |
| SDK error | Runner sends `task.failed` with error message, returns to idle |
| Runner process killed | SDK subprocess dies. Backend detects missing heartbeats (90s / 3 missed) and marks agent OFFLINE |
| Backend unreachable at start | Retries connection with exponential backoff until successful |
| Task exceeds timeout | Runner cancels Claude and sends `task.failed` |

### Message Buffering

When the WebSocket connection drops mid-task, the runner:

1. SDK continues executing (process stays alive)
2. Buffers all outgoing messages (task events, status updates) in a deque
3. Attempts reconnection with exponential backoff
4. On reconnect: re-registers, then flushes all buffered messages in order

This ensures no events are lost during transient network issues.

## Approval Gates

The SDK's `can_use_tool` callback fires when Claude calls `AskUserQuestion`:

1. Runner sends `approval.needed` to the backend with the question and options
2. Backend forwards this to the frontend WebSocket
3. The web UI displays an approval card with Approve/Reject buttons
4. User responds → backend forwards `approval.response` to the runner
5. Runner returns `PermissionResultAllow` → SDK continues execution

If the user rejects, the runner returns `PermissionResultDeny(interrupt=True)` and reports the task as failed.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `websockets` | >= 12.0 | Async WebSocket client |
| `pyyaml` | >= 6.0 | YAML config parsing |
| `claude-agent-sdk` | >= 0.1.40 | Claude Agent SDK for task execution |

All other functionality uses Python stdlib (`asyncio`, `json`, `logging`, `dataclasses`, `signal`).
