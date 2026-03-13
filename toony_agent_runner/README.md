# toony_agent_runner

Python asyncio daemon that connects a ToonyAgent bot to the Toony Dev Core backend. It receives tasks via WebSocket, executes them via the Claude Agent SDK, streams events in real-time, handles interactive approval gates, and supports concurrent task execution.

## Requirements

- Python 3.11+
- Claude Code CLI installed and available in `$PATH`
- Claude authentication configured (see [Claude Authentication](#claude-authentication) below)
- Network access to the Toony Dev Core backend

## Installation

```bash
cd toony_agent_runner
pip install -e .
```

This installs the `toony-agent-runner` CLI command.

## Claude Authentication

The runner uses the Claude Agent SDK, which needs valid credentials to communicate with the Claude API. There are two options:

### Option A: MAX Plan (OAuth token) — recommended for personal use

1. Run `claude setup-token` in your terminal and follow the prompts to authenticate with your Anthropic account.

2. This generates an OAuth token. Pass it to the runner via **environment variable** or **config file**:

   ```bash
   # Environment variable (recommended — avoids storing token in config file)
   export CLAUDE_CODE_OAUTH_TOKEN="your-oauth-token-here"
   toony-agent-runner --config config.yml
   ```

   Or in `config.yml`:

   ```yaml
   claude:
     oauth_token: "your-oauth-token-here"
   ```

### Option B: API Key

If you have an Anthropic API key, set it as an environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
toony-agent-runner --config config.yml
```

The SDK will pick it up automatically — no config file changes needed.

### Verifying authentication

```bash
# Quick test — should print a response without errors
claude -p "say hello" --output-format stream-json 2>&1 | head -5
```

If this works, the runner will be able to authenticate.

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
     max_concurrent_tasks: 3    # run up to 3 tasks simultaneously
     permission_mode: "acceptEdits"
   ```

   > **Note:** Claude authentication (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`) should be set as an environment variable before starting the runner. See [Claude Authentication](#claude-authentication).

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
| `workspace_root` | `~/work` | Base directory for all org workspaces. See [Workspace Configuration](#workspace-configuration) |
| `clone_protocol` | `ssh` | Protocol for cloning repositories: `ssh` or `https` |
| `claude.working_directory` | `.` | Fallback directory for tasks without a `project_id` |
| `claude.max_task_timeout` | `3600` | Max seconds per task before timeout |
| `claude.approval_timeout` | `600` | Max seconds to wait for user approval response |
| `claude.max_concurrent_tasks` | `1` | Max Claude tasks running simultaneously. Set higher for parallel execution |
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
├── protocol.py        # Message type definitions + serialization
└── workspace.py       # Workspace provisioning from config.sync payloads
```

### Lifecycle

```
START
  ├─ Load config from YAML
  ├─ Connect to backend via WebSocket (API key auth)
  ├─ Send "register" with metadata (hostname, platform, version, PID)
  ├─ Receive "config.sync" → provision workspace dirs + write YAML files
  │
  ├─ IDLE LOOP
  │    ├─ Send heartbeat every 30s
  │    ├─ Wait for messages from backend
  │    │
  │    ├─ On "task.assign" (if capacity available):
  │    │    ├─ Send "task.accepted"
  │    │    ├─ Create ClaudeSDKClient with PreToolUse hook
  │    │    │
  │    │    ├─ STREAM LOOP (receive SDK events):
  │    │    │    ├─ StreamEvent → classify, extract data, send "task.event"
  │    │    │    └─ ResultMessage → send "task.completed" or "task.failed"
  │    │    │
  │    │    └─ If AskUserQuestion tool called (via PreToolUse hook):
  │    │         ├─ Send "approval.needed" to backend
  │    │         ├─ Wait for "approval.response" from user (routed by task_id)
  │    │         └─ Return deny with user's answer as permissionDecisionReason
  │    │
  │    ├─ On "task.cancel": set cancel event for specific task
  │    ├─ On "command.execute":
  │    │    ├─ Look up command_key in COMMAND_REGISTRY
  │    │    ├─ Execute handler with args (sandboxed to working_dir)
  │    │    └─ Send "command.result" with success/error
  │    └─ On disconnect: reconnect with exponential backoff
  │
  └─ On SIGINT/SIGTERM: set all cancel events, wait for tasks, close connection, exit
```

### Resiliency

| Scenario | Behavior |
|----------|----------|
| WebSocket disconnects during task | SDK keeps executing, runner buffers events, reconnects, flushes buffer |
| SDK error | Runner sends `task.failed` with error message, returns to idle |
| Runner process killed | SDK subprocesses die. Backend detects missing heartbeats (90s / 3 missed) and marks agent OFFLINE |
| Backend unreachable at start | Retries connection with exponential backoff until successful |
| Task exceeds timeout | Runner cancels Claude and sends `task.failed` |

## Commands

The runner can execute direct commands from the backend, independently of Claude tasks. Commands run in parallel — they don't block task execution or each other.

### Available Commands

| Key | Args | Description |
|-----|------|-------------|
| `create_dir` | `path` | Create directory with parents |
| `create_file` | `path`, `content?` | Create file (empty or with content) |
| `move_file` | `source`, `destination` | Move file or directory |
| `rename_file` | `path`, `new_name` | Rename in same directory |
| `copy_file` | `source`, `destination` | Copy file or directory |
| `download_url` | `url`, `destination` | Download from external URL |
| `download_backend` | `download_url`, `destination` | Download from backend (auth via API key) |
| `git_clone` | `repo_url`, `destination?` | Clone a git repository |
| `run_script` | `path`, `args?` | Execute .sh, .bash, or .py script |

All paths are sandboxed to the configured `working_directory`. Path traversal attempts are rejected.

### Protocol

Request (backend → runner):
```json
{
    "type": "command.execute",
    "command_id": "uuid",
    "command_key": "create_file",
    "args": {"path": "src/main.py", "content": "print('hello')"}
}
```

Response (runner → backend):
```json
{
    "type": "command.result",
    "command_id": "uuid",
    "success": true,
    "output": "File created: src/main.py"
}
```

### Message Buffering

When the WebSocket connection drops mid-task, the runner:

1. SDK continues executing (process stays alive)
2. Buffers all outgoing messages (task events, status updates) in a deque
3. Attempts reconnection with exponential backoff
4. On reconnect: re-registers, then flushes all buffered messages in order

This ensures no events are lost during transient network issues.

## Approval Gates

A `PreToolUse` hook with `matcher="AskUserQuestion"` intercepts every `AskUserQuestion` call — regardless of permission mode (unlike `can_use_tool`, which is skipped for auto-approved tools under `acceptEdits`):

1. Runner sends `approval.needed` to the backend with the question and options
2. Backend forwards this to the frontend WebSocket
3. The web UI displays an approval card with Approve/Reject buttons (and a text input)
4. User responds → backend forwards `approval.response` to the runner
5. Hook always returns `permissionDecision: "deny"` with the user's answer as `permissionDecisionReason`

The hook always denies because there is no terminal for the CLI to render the question. Claude receives the user's answer as the denial reason and uses it to continue normally.

## Concurrent Task Execution

The runner supports running multiple Claude tasks simultaneously, controlled by `max_concurrent_tasks` (default: `1` for backward compatibility).

```yaml
claude:
  max_concurrent_tasks: 3
```

How it works:

- Each task gets its own `asyncio.Task` and cancellation event, keyed by `task_id`
- Approval gates are routed per-task — an approval on one task doesn't affect others
- When at capacity, new `task.assign` / `task.reply` messages are ignored (task stays QUEUED on the backend)
- `task.cancel` targets only the specific task; other tasks continue unaffected
- On shutdown (SIGINT/SIGTERM), all active tasks receive cancel signals and are given 10s to finish gracefully before being force-cancelled

Logs include slot usage for visibility: `[2/3 slots]`.

## Workspace Configuration

When the runner connects, the backend sends a `config.sync` message containing all organizations and projects associated with the ToonyAgent. The runner auto-provisions a local directory structure and writes config files so tasks can be routed to the correct project directory.

### Directory Structure

```
~/work/                                  # workspace_root (configurable in config.yml)
  myorg/
    .toony/
      workspace-registry.yaml            # auto-generated by config.sync (full overwrite)
    projects/
      backend-api/
        .toony/
          local.yaml                     # optional local overrides (never touched by sync)
        ...
      frontend-app/
        ...
  othercorp/
    .toony/
      workspace-registry.yaml
    projects/
      ...
```

### How It Works

1. Runner connects and sends `register`
2. Backend responds with `config.sync` containing all orgs + projects
3. Runner creates directories and writes `workspace-registry.yaml` for each org
4. When a `task.assign` includes a `project_id`, the runner resolves it to `{workspace_root}/{org_slug}/projects/{project_slug}/` and uses that as Claude's `cwd`
5. Tasks without `project_id` fall back to `claude.working_directory`

You can also trigger a sync from the web UI by clicking **Sync Config** on the ToonyAgent detail page (available when the agent is ONLINE or BUSY).

### workspace-registry.yaml

**Location:** `{workspace_root}/{org_slug}/.toony/workspace-registry.yaml`

Auto-generated by `config.sync` — **full overwrite on every sync**. Do not edit manually when managed by sync; changes will be lost. Can also be created manually if you prefer not to use auto-provisioning.

See [`workspace-registry.example.yaml`](workspace-registry.example.yaml) for the full template.

Key fields:
- `organization` / `organization_id` — org identity
- `integrations` — PM tool (linear, jira), git provider (github, gitlab, bitbucket), and provider-specific keys
- `defaults` — org-wide base_branch, branch_convention, default_reviewers
- `projects[]` — list of projects with name, id, slug, repo URL, branch settings, issue_prefix

### local.yaml

**Location:** `{workspace_root}/{org_slug}/projects/{project_slug}/.toony/local.yaml`

Optional per-project overrides that **cannot** be derived from the backend or discovered by Claude from the repo. Never touched by `config.sync`. All fields are optional — only add what you need.

See [`local.example.yaml`](local.example.yaml) for the full template.

Common fields: `environments`, `deploy_cmd`, `docs_url`, `api_docs_url`, `slack_channel`, `pr_template`, `auto_label_pr`.

### Multiple Runners on the Same Machine

If multiple runners share the same machine, each must use a different `workspace_root` to avoid conflicts:

```yaml
# Runner A
workspace_root: "~/work/runner-a"

# Runner B
workspace_root: "~/work/runner-b"
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `websockets` | >= 12.0 | Async WebSocket client |
| `pyyaml` | >= 6.0 | YAML config parsing |
| `claude-agent-sdk` | >= 0.1.40 | Claude Agent SDK for task execution |

All other functionality uses Python stdlib (`asyncio`, `json`, `logging`, `dataclasses`, `signal`).
