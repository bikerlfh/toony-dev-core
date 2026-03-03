# Design: ToonyAgent Bot Control Plane V1

## Overview

System to send development tasks from the Toony Dev Core web frontend to Claude Code bots (ToonyAgents) running on local or remote machines. Users see real-time bot output and can interact with approval gates through a hybrid dashboard + chat UI.

## Key Decisions

| Decision | Choice |
|---|---|
| Connectivity | Bot connects outbound to backend via WebSocket |
| UI | Hybrid: pipeline dashboard (left) + live chat/output (right) |
| Runner | Python asyncio daemon (`toony_agent_runner`) |
| Pause model | Long-running interactive session (single claude process per task) |
| Gate detection | Structured output parsing of stream-json (`AskUserQuestion` tool_use) |
| Concurrency | Multiple bots per org (M2M relationship) |
| Auth | API key per ToonyAgent (hashed, shown once, revocable) |
| Scope V1 | Core loop only (no pipeline YAML, no Linear integration, no worktrees) |

## V1 Scope

**In scope:**
- ToonyAgent registration + API key auth
- Task assignment from web UI
- Real-time output streaming via WebSocket
- Approval gates (pause/resume via AskUserQuestion detection)
- Hybrid dashboard + chat UI
- Bot health monitoring (heartbeat, online/offline/busy)

**Out of scope (future):**
- Pipeline YAML configuration
- Linear/GitHub MCP integration
- Worktree management
- Multi-stage pipeline orchestration
- Relationship between ToonyAgent and existing Agent/Skill models

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                            │
│  /toony-agents/                → list of bots            │
│  /toony-agents/<slug>/tasks/<id> → dashboard + chat      │
└────────────────┬────────────────────────────────────────┘
                 │ WebSocket (JWT auth, existing pattern)
┌────────────────▼────────────────────────────────────────┐
│                    DJANGO BACKEND                        │
│                                                          │
│  New models:                                             │
│    ToonyAgent      — registered bot instance             │
│    ToonyAgentKey   — API key for auth                    │
│    AgentTask       — task assigned to bot                │
│    TaskEvent       — event stream per task (immutable)   │
│                                                          │
│  New consumers:                                          │
│    ToonyAgentRunnerConsumer (bot-facing WS)               │
│    ToonyAgentConsumer (frontend-facing WS)                │
└────────────────┬────────────────────────────────────────┘
                 │ WebSocket (API key auth)
┌────────────────▼────────────────────────────────────────┐
│           toony_agent_runner (bot machine)                │
│  Python asyncio daemon                                   │
│  Spawns claude --output-format stream-json               │
│  Streams events, handles approval gates                  │
└─────────────────────────────────────────────────────────┘
```

Two separate WebSocket channels:
- **Frontend <-> Backend**: JWT auth (existing pattern), server pushes task events + approval requests
- **Runner <-> Backend**: API key auth, denser protocol (stream-json events forwarded)

Backend is the hub. Runner and frontend never communicate directly.

---

## Data Models

New Django app: `toony_agents/`

### ToonyAgent

Represents a registered bot instance.

```python
class ToonyAgent(BaseModel):                # UUID pk, created_at, updated_at
    name = CharField(max_length=255)         # "Luis Local", "CI Server 1"
    slug = SlugField(unique=True)            # Globally unique
    organizations = M2M(Organization,        # Available to these orgs
        related_name="toony_agents", blank=True)
    status = CharField(choices=[
        OFFLINE,                             # Not connected
        ONLINE,                              # Connected, idle
        BUSY,                                # Executing a task
    ], default=OFFLINE)
    last_heartbeat = DateTimeField(null=True)
    last_connected_at = DateTimeField(null=True)
    metadata = JSONField(default=dict)       # Machine info, OS, claude version
    registered_by = FK(User)
```

### ToonyAgentKey

API key for runner authentication. Raw key shown once at creation, only hash stored.

```python
class ToonyAgentKey(BaseModel):
    toony_agent = FK(ToonyAgent, related_name="keys")
    key_hash = CharField(max_length=128)     # SHA-256
    key_prefix = CharField(max_length=8)     # "tok_ta_x" for display
    name = CharField(max_length=255)         # "production", "dev"
    is_active = BooleanField(default=True)
    last_used_at = DateTimeField(null=True)
    expires_at = DateTimeField(null=True)
    created_by = FK(User)
```

### AgentTask

A task assigned to a ToonyAgent.

```python
class AgentTask(BaseModel):
    organization = FK(Organization)          # Org that owns this task
    toony_agent = FK(ToonyAgent, related_name="tasks", null=True)
    title = CharField(max_length=500)
    prompt = TextField()                     # Sent to claude stdin
    status = CharField(choices=[
        QUEUED,                              # Waiting for bot
        ASSIGNED,                            # Sent to bot
        RUNNING,                             # Bot executing
        AWAITING_APPROVAL,                   # Bot hit approval gate
        COMPLETED,                           # Finished successfully
        FAILED,                              # Error or crash
        CANCELLED,                           # User cancelled
    ], default=QUEUED)
    result = TextField(null=True)            # Final output
    error = TextField(null=True)             # Error if failed
    started_at = DateTimeField(null=True)
    completed_at = DateTimeField(null=True)
    created_by = FK(User)
```

### TaskEvent

Immutable append-only event stream for real-time UI.

```python
class TaskEvent(Model):                      # NOT BaseModel — no updated_at
    id = UUIDField(primary_key=True)
    task = FK(AgentTask, related_name="events")
    event_type = CharField(choices=[
        LOG,                                 # General output
        TOOL_USE,                            # Claude used a tool
        TOOL_RESULT,                         # Tool result
        APPROVAL_NEEDED,                     # Bot needs user input
        APPROVAL_RESPONSE,                   # User responded
        STATUS_CHANGE,                       # Task status changed
        ERROR,                               # Error occurred
    ])
    data = JSONField()                       # Event-specific payload
    sequence = IntegerField()                # Ordering within task
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sequence"]
        indexes = [("task", "sequence")]
```

---

## WebSocket Protocol

### Channel 1: Runner <-> Backend

```
ws://backend/ws/toony-agents/runner/?key=tok_ta_xxxxxxxx
```

**Runner -> Backend:**

| Message | Purpose |
|---|---|
| `register` | Identify bot + send machine metadata |
| `heartbeat` | Keep-alive every 30s |
| `task.accepted` | Acknowledge task assignment |
| `task.event` | Stream claude output event (log, tool_use, tool_result, error) |
| `approval.needed` | Claude hit AskUserQuestion — needs human input |
| `task.completed` | Task finished successfully |
| `task.failed` | Task errored or crashed |

**Backend -> Runner:**

| Message | Purpose |
|---|---|
| `heartbeat.ack` | Respond to heartbeat |
| `task.assign` | Send task to bot (prompt + config) |
| `approval.response` | Forward user's approval/rejection/message |
| `task.cancel` | User cancelled the task |

### Channel 2: Frontend <-> Backend

```
ws://backend/ws/toony-agents/<agent_id>/?token=jwt_xxx
```

**Backend -> Frontend (server push):**

| Message | Purpose |
|---|---|
| `agent.status` | Bot online/offline/busy |
| `task.event` | Forwarded event from runner (for live output) |
| `approval.needed` | Show approval card in UI |
| `task.status` | Task status changed |

**Frontend -> Backend:**

| Message | Purpose |
|---|---|
| `approval.response` | User approved/rejected/sent message |
| `task.cancel` | User wants to cancel task |

### Approval Gate Flow

```
Runner                    Backend                   Frontend
  │                         │                         │
  │ approval.needed ───────>│ save TaskEvent          │
  │                         │ update AgentTask status │
  │                         │ approval.needed ───────>│
  │                         │                         │ User sees gate
  │                         │                         │ User clicks [Approve]
  │                         │ approval.response <─────│
  │ approval.response <─────│ save TaskEvent          │
  │                         │                         │
  │ (writes to claude stdin)│                         │
  │ task.event (resumes) ──>│ broadcast ─────────────>│
```

---

## toony_agent_runner

Python asyncio daemon that runs on the bot machine.

### Structure

```
toony_agent_runner/
├── pyproject.toml
├── config.yml
├── toony_agent_runner/
│   ├── __init__.py
│   ├── main.py                 # Entry point, lifecycle
│   ├── connection.py           # WebSocket client + reconnection
│   ├── claude_process.py       # Spawn + manage claude process
│   ├── stream_parser.py        # Parse stream-json, detect gates
│   └── protocol.py             # Message types + serialization
└── README.md
```

### Configuration

```yaml
backend_url: "ws://192.168.1.50:8000/ws/toony-agents/runner/"
api_key: "tok_ta_xxxxxxxxxxxxxxxx"
agent_id: "uuid-of-this-toony-agent"

claude:
  binary: "claude"
  output_format: "stream-json"
  working_directory: "/home/dev/projects/my-project"
  max_task_timeout: 3600

reconnect:
  max_retries: -1
  backoff_base: 1
  backoff_max: 30
```

### Lifecycle

```
START
  → Connect to backend WS
  → Send: register (agent_id, metadata)
  → IDLE LOOP (heartbeat every 30s, wait for task.assign)
      → Receive task.assign
      → Send: task.accepted
      → Spawn: claude --output-format stream-json
      → Write prompt to stdin
      → STREAM LOOP:
          Parse stdout line by line
          if AskUserQuestion detected:
            → Send approval.needed
            → Wait for approval.response
            → Write response to claude stdin
          else:
            → Send task.event
      → Process exits:
          exit 0 → task.completed → back to IDLE
          exit != 0 → task.failed → back to IDLE
```

### Resiliency

- **WS disconnects during task**: Runner does NOT kill claude. Reconnects, sends buffered events.
- **Claude crashes**: Runner sends `task.failed`, returns to idle.
- **Runner restarts**: Claude dies (child process). Backend detects missing heartbeat (90s / 3 missed), marks agent OFFLINE and running tasks as FAILED.

---

## Frontend UI

### New Pages

| Route | Purpose |
|---|---|
| `/[orgSlug]/toony-agents/` | List of bots (cards with status) |
| `/[orgSlug]/toony-agents/[slug]/` | Bot detail + task list |
| `/[orgSlug]/toony-agents/[slug]/tasks/[taskId]/` | Hybrid dashboard + chat |

### Task View Layout (hybrid)

```
┌────────────────────────┬────────────────────────────────┐
│   Pipeline (left)      │   Live Output (right)          │
│                        │                                │
│   ✅ Task received     │   ▸ Reading src/auth/login.ts  │
│   ▶ Implementing ⏱    │   ▸ Editing src/auth/login.ts  │
│   ⏳ Testing           │                                │
│   ⏳ Review            │   ┌──────────────────────────┐ │
│                        │   │ ⚠️ APPROVAL NEEDED       │ │
│                        │   │ [Approve] [Reject]       │ │
│                        │   └──────────────────────────┘ │
│                        │                                │
│                        │   [Type a message...]  [Send]  │
└────────────────────────┴────────────────────────────────┘
```

- **Left panel**: Auto-grouped stages from TaskEvents, active stage has timer
- **Right panel**: Live scroll of events, approval cards inline, free-text input box
- **Input box**: Sends `approval.response` with `action: "message"` — user can send free text to bot anytime

### New Components

```
frontend/
├── app/(dashboard)/[orgSlug]/toony-agents/
│   ├── page.tsx                              # Bot list
│   ├── [slug]/
│   │   ├── page.tsx                          # Bot detail + tasks
│   │   └── tasks/
│   │       └── [taskId]/
│   │           └── page.tsx                  # Hybrid dashboard + chat
├── components/toony-agents/
│   ├── toony-agent-list.tsx
│   ├── toony-agent-card.tsx
│   ├── toony-agent-status-badge.tsx
│   ├── task-pipeline-panel.tsx
│   ├── task-live-output.tsx
│   ├── task-event-item.tsx
│   ├── approval-gate-card.tsx
│   ├── task-input-box.tsx
│   ├── create-task-modal.tsx
│   ├── manage-keys-modal.tsx
│   └── register-bot-modal.tsx
├── hooks/
│   └── use-toony-agent-websocket.ts
├── lib/api/
│   └── toony-agents.ts
└── types/
    └── toony-agents.ts
```

### WebSocket Hook

```typescript
useToonyAgentWebSocket({
  agentId: string,
  taskId?: string,
  onTaskEvent: (event: TaskEvent) => void,
  onApprovalNeeded: (data: ApprovalData) => void,
  onAgentStatus: (status: AgentStatus) => void,
}): {
  readyState: WsReadyState,
  sendApproval: (taskId, action, response) => void,
  cancelTask: (taskId) => void,
}
```

---

## End-to-End Flow

### Phase 0: Setup (once)

1. Admin registers ToonyAgent in web UI
2. System generates API key (shown once)
3. Admin configures `config.yml` on bot machine with key + agent_id
4. Runner starts: `toony-agent-runner start`
5. Runner connects to backend WS, sends `register`
6. Backend marks ToonyAgent as ONLINE, broadcasts to frontend

### Phase 1: Create Task

1. User navigates to bot detail page
2. Clicks [+ New Task], fills title + prompt
3. Backend creates AgentTask (status=QUEUED)
4. User redirected to hybrid task view

### Phase 2: Assign to Bot

1. Backend checks ToonyAgent is ONLINE
2. Sends `task.assign` via WS to runner
3. Runner acknowledges with `task.accepted`
4. AgentTask status -> ASSIGNED
5. If bot is OFFLINE, task stays QUEUED until bot connects

### Phase 3: Execution

1. Runner spawns `claude --output-format stream-json`
2. Writes prompt to stdin
3. AgentTask status -> RUNNING
4. Runner parses stdout, sends `task.event` for each stream-json event
5. Backend saves TaskEvent + broadcasts to frontend
6. Frontend renders events in live output panel

### Phase 4: Approval Gate

1. Runner detects `AskUserQuestion` in stream-json
2. Sends `approval.needed` to backend
3. AgentTask status -> AWAITING_APPROVAL
4. Frontend shows approval card with question + options
5. User clicks [Approve] / [Reject] or types free text
6. Backend forwards `approval.response` to runner
7. Runner writes response to claude stdin
8. AgentTask status -> RUNNING, stream resumes

### Phase 5: Completion

1. Claude process exits (code 0)
2. Runner sends `task.completed` with result
3. AgentTask status -> COMPLETED, ToonyAgent status -> ONLINE
4. Frontend shows completion summary

### Error Cases

- **Claude crashes**: Runner sends `task.failed`, returns to idle
- **Bot disconnects**: Backend detects 3 missed heartbeats (90s), marks OFFLINE, tasks FAILED
- **User cancels**: Backend sends `task.cancel` to runner, runner kills claude process
