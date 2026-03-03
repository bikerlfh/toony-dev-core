# toony_agent_runner

Python asyncio daemon that connects a ToonyAgent bot to the Toony Dev Core backend. It receives tasks via WebSocket, spawns Claude Code processes, streams output in real-time, and handles interactive approval gates.

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
     binary: "claude"
     output_format: "stream-json"
     working_directory: "/path/to/your/project"
     max_task_timeout: 3600

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
| `claude.binary` | `claude` | Path to the Claude Code CLI binary |
| `claude.output_format` | `stream-json` | Claude output format. Must be `stream-json` |
| `claude.working_directory` | `.` | Directory where Claude executes tasks |
| `claude.max_task_timeout` | `3600` | Max seconds per task before timeout |
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
├── main.py            # Entry point, lifecycle, task orchestration
├── connection.py      # WebSocket client with reconnection + message buffering
├── claude_process.py  # Subprocess management for Claude CLI
├── stream_parser.py   # Parse stream-json output, detect approval gates
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
  │    │    ├─ Spawn: claude --output-format stream-json -p <prompt>
  │    │    │
  │    │    ├─ STREAM LOOP (read stdout line by line):
  │    │    │    ├─ Parse JSON event
  │    │    │    ├─ If AskUserQuestion detected:
  │    │    │    │    ├─ Send "approval.needed" to backend
  │    │    │    │    ├─ Wait for "approval.response" from user
  │    │    │    │    ├─ On approve: write response to Claude stdin
  │    │    │    │    └─ On reject: cancel Claude process
  │    │    │    └─ Else: send "task.event" to backend
  │    │    │
  │    │    ├─ Claude exits with code 0 → send "task.completed"
  │    │    └─ Claude exits with code != 0 → send "task.failed"
  │    │
  │    ├─ On "task.cancel": send SIGTERM to Claude
  │    └─ On disconnect: reconnect with exponential backoff
  │
  └─ On SIGINT/SIGTERM: cancel running task, close connection, exit
```

### Resiliency

| Scenario | Behavior |
|----------|----------|
| WebSocket disconnects during task | Runner keeps Claude alive, buffers events, reconnects, flushes buffer |
| Claude crashes (non-zero exit) | Runner sends `task.failed` with exit code, returns to idle |
| Runner process killed | Claude child process dies. Backend detects missing heartbeats (90s / 3 missed) and marks agent OFFLINE |
| Backend unreachable at start | Retries connection with exponential backoff until successful |
| Task exceeds timeout | Runner cancels Claude and sends `task.failed` |

### Message Buffering

When the WebSocket connection drops mid-task, the runner:

1. Continues reading Claude stdout (process stays alive)
2. Buffers all outgoing messages (task events, status updates) in a deque
3. Attempts reconnection with exponential backoff
4. On reconnect: re-registers, then flushes all buffered messages in order

This ensures no events are lost during transient network issues.

## Approval Gates

The runner detects when Claude uses the `AskUserQuestion` tool by parsing the `stream-json` output. When detected:

1. Runner sends `approval.needed` to the backend with the question and options
2. Backend forwards this to the frontend WebSocket
3. The web UI displays an approval card with Approve/Reject buttons
4. User responds → backend forwards `approval.response` to the runner
5. Runner writes the response to Claude's stdin → execution resumes

If the user rejects, the runner sends SIGTERM to Claude and reports the task as failed.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `websockets` | >= 12.0 | Async WebSocket client |
| `pyyaml` | >= 6.0 | YAML config parsing |

All other functionality uses Python stdlib (`asyncio`, `subprocess`, `json`, `logging`, `dataclasses`, `signal`, `hashlib`).
