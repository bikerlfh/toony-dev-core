# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`toony_agent_runner` is a Python asyncio daemon that bridges Claude Code with the Toony Dev Core backend. It connects via WebSocket, receives task assignments, and executes them using persistent Claude CLI sessions (`claude -p --input-format stream-json --output-format stream-json`). Events are streamed in real-time, and task replies reuse the same process via stdin instead of spawning new processes with `--resume`.

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
main.py --- Orchestrator: CLI entry, config loading, main event loop, message dispatch,
  |          session pool management, idle session cleanup
  |
  |-- task_executor.py --- Executes tasks via PersistentClaude, streams events back to backend,
  |                         falls back to --resume when persistent session is unavailable
  |
  |-- cli_executor.py --- PersistentClaude class (stream-json bidirectional I/O), legacy run_claude
  |                        (one-shot subprocess), event extraction helpers
  |
  |-- connection.py --- BackendConnection: WebSocket client, reconnection w/ exponential backoff, message buffering
  |
  +-- config.py --- Configuration loading/saving with dataclasses (RunnerConfig, ClaudeConfig, ReconnectConfig, FileTreeDenylistConfig)
  |
  +-- protocol.py --- Dataclass message types with to_json() serialization
  |                    Outgoing: Register, Heartbeat, TaskAccepted, TaskEvent, QuestionAsked,
  |                              TaskCompleted, TaskFailed, CommandResult, ConfigSyncAck,
  |                              RepoCloneResult, ConfigUpdateAck, FileTreeSyncMessage
  |                    Incoming: TaskAssign, QuestionAnswered, TaskCancel, TaskReply, HeartbeatAck,
  |                              CommandExecute, ConfigSync, ConfigUpdate, FileTreeSyncAck
  |
  +-- workspace.py --- Workspace provisioning: directory creation, repo cloning,
  |                     workspace-registry.yaml generation, file tree collection, skill collection
  |
  +-- commands/         --- Command execution: registry of filesystem/download/git/script handlers,
                             sandboxed to working_directory, dispatched independently of Claude tasks
```

### Lifecycle Flow

1. Load YAML config -> connect WebSocket (API key via `?key=` query param) -> send `register` with host metadata
2. Idle loop: send heartbeats every 30s, wait for `task.assign`; cleanup idle sessions every `session_cleanup_interval` seconds (default 600)
3. On task: create `PersistentClaude` process (`--input-format stream-json --output-format stream-json`) -> send prompt via stdin -> stream events from stdout -> send `task.event` messages
4. On result event: send `task.completed` or `task.failed`; process stays alive in `session_pool`
5. On `task.reply` or `question.answered`: look up session in `session_pool` -> send message via stdin to same process (no restart). Falls back to `--resume` if session expired or died
6. Session idle timeout (default 5 min, configurable via `claude.session_idle_timeout` in config.yml): cleanup loop closes idle sessions
7. On `command.execute`: look up `command_key` in `COMMAND_REGISTRY`, execute handler with args (sandboxed to `working_dir`), send `command.result` with success/error
8. On SIGINT/SIGTERM: close all persistent sessions, terminate CLI processes, close connection, exit

### Key Design Decisions

- **Persistent CLI sessions**: Uses `claude -p --input-format stream-json --output-format stream-json` to keep a single process alive across multiple turns. Messages are sent via stdin as NDJSON, responses read from stdout. This eliminates process startup overhead per reply and improves prompt cache hit rates. Falls back to legacy `--resume` (new process) when no persistent session is available.
- **Direct CLI invocation**: Uses the CLI subprocess instead of the Claude Agent SDK. The CLI loads skills from `~/.claude/skills/` and `~/.agents/skills/`, which the SDK does not support.
- **Session idle timeout**: Persistent sessions auto-close after inactivity (default 5 min). Configurable via `claude.session_idle_timeout` in config.yml (seconds). A background loop checks every `session_cleanup_interval` seconds (default 600 / 10 min).
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
| Out | `command.result` | Runner reports command execution result |
| Out | `config.sync.ack` | Acknowledge config.sync with org/project counts |
| Out | `repo.clone.result` | Report repo clone status (success/error, duration) |
| Out | `config.update.ack` | Acknowledge config update |
| Out | `file_tree.sync` | Send project file tree and skills to backend for caching |
| In | `task.assign` | Backend assigns task (task_id, title, prompt) |
| In | `task.cancel` | Request task cancellation |
| In | `task.reply` | Resume conversation with session_id |
| In | `question.answered` | User's answer to a question |
| In | `command.execute` | Backend sends a direct command (key + args) |
| In | `config.sync` | Workspace configuration (organizations + projects) |
| In | `config.update` | Update runner config (max_concurrent_tasks, max_task_timeout) |
| In | `heartbeat.ack` | Backend acknowledges heartbeat |
| In | `file_tree.sync.ack` | Backend acknowledges file tree sync |

### File Tree Sync

After `config.sync` completes (repos cloned), the runner sends `file_tree.sync` for each project with a `.git` directory. The message includes a flat list of relative file paths and a list of available skills. The backend caches this in `ProjectFileTree` for the frontend's `@` file mention and `/` skill autocomplete.

**Triggers:**
1. On connect — after `config.sync` for all cloned projects
2. On `task.completed` — only if files were created or deleted during execution (snapshot comparison)

**Skill collection:** Scans `.claude/skills/*/` at project level and `~/.claude/skills/*/` at user level. Extracts name (directory name) and description (first content line from skill.md). Project-level skills take precedence over user-level skills with the same name.

### File Tree Denylist

`collect_file_tree()` in `workspace.py` skips files and directories that are not useful for the autocomplete. There are three layers of filtering:

**Hardcoded defaults:**
- **Directories:** `.git`, `node_modules`, `__pycache__`, `.venv`, `venv`, `dist`, `build`, `.next`, `.cache`, `coverage`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache`, `.tox`, `egg-info`, `.eggs`, `target`
- **Paths (subtrees):** `migrations`
- **Files (exact name):** `.DS_Store`, `Thumbs.db`, `.env`, `.env.local`, `.env.production`, `.gitkeep`, `.gitattributes`, `__init__.py`
- **Extensions:** `.pyc`, `.pyo`, `.pyd`, `.so`, `.dylib`, `.dll`, `.class`, `.o`, `.obj`, `.a`, `.lib`, `.lock`, `.log`, `.swp`, `.swo`, `.swn`, `.map`

**Configurable extensions via `file_tree_denylist` in config YAML:**

```yaml
file_tree_denylist:
  files:
    - "custom_file.txt"
  extensions:
    - ".dat"
  paths:
    - "vendor"
```

These lists are **merged** with the hardcoded defaults — they extend, not replace. If the section is omitted, only the defaults apply.
