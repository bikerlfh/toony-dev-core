# ToonyAgent Bot Control Plane — Architecture & Communication Flows

## System Overview

The ToonyAgent Bot Control Plane enables users to send development tasks from the web frontend to Claude Code bots running on any machine (local, LAN, or remote). The architecture uses the backend as a central hub — the runner and frontend never communicate directly.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         User's Browser (Frontend)                           │
│  Next.js 15 / React 19                                                     │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────────────────────────────────────┐ │
│  │ Bot List Page     │  │ Task View (hybrid dashboard + chat)             │ │
│  │ Bot Detail Page   │  │  ┌─────────────┐  ┌──────────────────────────┐ │ │
│  │ Register Bot      │  │  │ Pipeline    │  │ Live Output              │ │ │
│  │ Manage Keys       │  │  │ (stages)    │  │ (events + approval cards)│ │ │
│  │ Create Task       │  │  └─────────────┘  └──────────────────────────┘ │ │
│  └──────────────────┘  └──────────────────────────────────────────────────┘ │
│           │ REST API                    │ WebSocket (JWT auth)               │
└───────────┼─────────────────────────────┼───────────────────────────────────┘
            │                             │
            ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Backend (Django + Channels + Redis)                       │
│                                                                             │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ REST API Layer              │  │ WebSocket Consumers                  │ │
│  │  ToonyAgent CRUD            │  │                                      │ │
│  │  API Key management         │  │  ToonyAgentConsumer                  │ │
│  │  Task CRUD                  │  │   (frontend-facing, JWT auth)        │ │
│  │  Task events query          │  │   Group: toony_agent_{id}            │ │
│  └─────────────────────────────┘  │                                      │ │
│                                    │  ToonyAgentRunnerConsumer            │ │
│  ┌─────────────────────────────┐  │   (runner-facing, API key auth)      │ │
│  │ Database (PostgreSQL)       │  │   Group: toony_agent_runner_{id}     │ │
│  │  ToonyAgent                 │  └──────────────────────────────────────┘ │
│  │  ToonyAgentKey              │            │                              │
│  │  AgentTask                  │            │ Channel Layer (Redis)        │
│  │  TaskEvent                  │            │ Bridges both consumers       │
│  └─────────────────────────────┘            │                              │
└─────────────────────────────────────────────┼──────────────────────────────┘
                                              │
                                              │ WebSocket (API key auth)
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Bot Machine (local, LAN, or remote)                        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ toony_agent_runner (Python asyncio daemon)                          │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │   │
│  │  │ connection   │  │ main         │  │ claude-agent-sdk           │  │   │
│  │  │ (WS client)  │  │ (lifecycle)  │  │ (ClaudeSDKClient)         │  │   │
│  │  └─────────────┘  └──────────────┘  └────────────┬───────────────┘  │   │
│  │                                                    │                  │   │
│  │  ┌──────────────┐  ┌──────────────┐               ▼                  │   │
│  │  │ protocol     │  │ stream_parser│         ┌────────────┐           │   │
│  │  │ (messages)   │  │ (SDK events) │         │ claude CLI │           │   │
│  │  └──────────────┘  └──────────────┘         │ (managed   │           │   │
│  │                                              │  by SDK)   │           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Authentication

Two separate authentication mechanisms serve two different WebSocket connections:

### Runner Authentication (API Key)

The runner authenticates via an API key passed as a query parameter:

```
ws://backend:8000/ws/toony-agents/runner/?key=tok_ta_xxxxxxxxxxxxxxxx
```

The key lifecycle:
1. Admin generates a key via web UI or API
2. Backend creates a `ToonyAgentKey` record storing only the **SHA-256 hash** of the key
3. The raw key (prefixed `tok_ta_`) is returned once and never stored
4. On connection, the consumer hashes the provided key and looks up the hash in the database
5. Keys can be revoked (soft-delete via `is_active=False`) and have optional expiration

### Frontend Authentication (JWT)

The frontend connects using the existing JWT pattern:

```
ws://backend:8000/ws/toony-agents/<agent-uuid>/?token=<jwt-access-token>
```

The consumer verifies the JWT via the existing `JwtAuthMiddleware` in the ASGI stack, then checks that the authenticated user belongs to at least one organization linked to the ToonyAgent.

## Data Models

### ToonyAgent

Represents a registered bot instance. A single ToonyAgent can serve multiple organizations (M2M).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Display name |
| `slug` | string (unique) | URL-safe identifier |
| `organizations` | M2M → Organization | Organizations this bot serves |
| `status` | OFFLINE / ONLINE / BUSY | Current connection status |
| `last_heartbeat` | datetime | Last heartbeat timestamp |
| `last_connected_at` | datetime | Last connection timestamp |
| `metadata` | JSON | Runner info: hostname, platform, version, PID |
| `registered_by` | FK → User | User who registered the bot |

### ToonyAgentKey

API key for runner authentication. Follows the GitHub/Stripe pattern — raw key shown once.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `toony_agent` | FK → ToonyAgent | Associated bot |
| `key_hash` | string | SHA-256 hash of the raw key |
| `key_prefix` | string | First 12 chars for display (e.g., `tok_ta_a3f2`) |
| `name` | string | Human-readable label |
| `is_active` | bool | Revoked keys are set to False |
| `last_used_at` | datetime | Updated on each authentication |
| `expires_at` | datetime (nullable) | Optional expiration |

### AgentTask

A task assigned to a bot. Follows a strict state machine.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organization` | FK → Organization | Owning organization |
| `toony_agent` | FK → ToonyAgent (nullable) | Assigned bot |
| `title` | string | Short description |
| `prompt` | text | Full prompt sent to Claude |
| `status` | enum | Current state (see state machine below) |
| `result` | text (nullable) | Completion output |
| `error` | text (nullable) | Error message on failure |
| `started_at` | datetime (nullable) | When execution began |
| `completed_at` | datetime (nullable) | When task finished |
| `created_by` | FK → User | User who created the task |

### TaskEvent

Immutable, append-only event stream. Does NOT extend `BaseModel` (no `updated_at`).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `task` | FK → AgentTask | Parent task |
| `event_type` | enum | LOG, TOOL_USE, TOOL_RESULT, APPROVAL_NEEDED, APPROVAL_RESPONSE, STATUS_CHANGE, ERROR |
| `data` | JSON | Event-specific payload |
| `sequence` | int | Ordering within task |
| `created_at` | datetime | When event was recorded |

## Task State Machine

```
                 ┌─────────────────────────────────────────────────────┐
                 │                                                     │
                 ▼                                                     │
  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐ │
  │          │      │          │      │          │      │          │ │
  │  QUEUED  ├─────>│ ASSIGNED ├─────>│ RUNNING  ├─────>│COMPLETED │ │
  │          │      │          │      │          │      │          │ │
  └────┬─────┘      └──────────┘      └─────┬────┘      └──────────┘ │
       │                                     │                         │
       │ (issue TODO→BACKLOG)                │                         │
       ▼                                     ▼                         │
  ┌──────────┐                        ┌──────────────┐                 │
  │          │                        │  AWAITING    │                 │
  │  PAUSED  │                        │  APPROVAL    ├─────────────────┘
  │          │                        │              │   (on approve → RUNNING)
  └──────────┘                        └──────┬───────┘
  (issue BACKLOG→TODO                        │
   reactivates → QUEUED)                     │ (on reject)
                                             ▼
                           ┌──────────┐  ┌──────────┐
                           │          │  │          │
                           │  FAILED  │  │CANCELLED │
                           │          │  │          │
                           └──────────┘  └──────────┘

Transitions:
  QUEUED → ASSIGNED         Runner sends "task.accepted"
  QUEUED → PAUSED           Issue moves TODO → BACKLOG (task paused, not cancelled)
  PAUSED → QUEUED           Issue moves BACKLOG → TODO (task reactivated with updated prompt)
  ASSIGNED → RUNNING        First task event arrives (atomic, happens once)
  RUNNING → AWAITING_APPROVAL   PreToolUse hook fires for AskUserQuestion
  AWAITING_APPROVAL → RUNNING   User approves (answer returned via permissionDecisionReason)
  AWAITING_APPROVAL → CANCELLED User rejects
  RUNNING → COMPLETED      SDK emits ResultMessage (success)
  RUNNING → FAILED          SDK emits ResultMessage (error) or exception
  Any active → CANCELLED    User cancels from frontend
```

## WebSocket Protocol

### Channel Groups

The backend maintains two channel groups per ToonyAgent, bridged through the Django Channels layer (Redis):

| Group | Format | Purpose | Members |
|-------|--------|---------|---------|
| Runner group | `toony_agent_runner_{agent_id}` | Backend ↔ Runner communication | RunnerConsumer |
| Frontend group | `toony_agent_{agent_id}` | Backend → Frontend broadcasts | ToonyAgentConsumer (all connected frontend clients) |

Messages flow through the backend hub:

```
Runner → RunnerConsumer → [save to DB] → group_send → FrontendConsumer → Frontend
Frontend → FrontendConsumer → [save to DB] → group_send → RunnerConsumer → Runner
```

### Messages: Runner → Backend

| Type | Fields | Description |
|------|--------|-------------|
| `register` | `metadata` | Runner announces itself. Backend sets agent ONLINE, sends queued tasks |
| `heartbeat` | — | Keepalive every 30s. Backend updates `last_heartbeat`, replies with `heartbeat.ack` |
| `task.accepted` | `task_id` | Runner acknowledges task receipt. Status: QUEUED → ASSIGNED |
| `task.event` | `task_id`, `event_type`, `data`, `sequence` | Claude output event. Saved as TaskEvent, forwarded to frontend |
| `approval.needed` | `task_id`, `data`, `sequence` | PreToolUse hook fired for AskUserQuestion. Status: → AWAITING_APPROVAL |
| `task.completed` | `task_id`, `result` | Claude exited successfully. Status: → COMPLETED |
| `task.failed` | `task_id`, `error` | Claude failed. Status: → FAILED |

### Messages: Backend → Runner

| Type | Fields | Description |
|------|--------|-------------|
| `heartbeat.ack` | — | Heartbeat acknowledged |
| `task.assign` | `task_id`, `title`, `prompt` | Backend assigns a task to execute |
| `approval.response` | `task_id`, `action`, `response` | User approved/rejected/messaged at an approval gate |
| `task.reply` | `task_id`, `message`, `session_id`, `sequence_offset` | Resume conversation with session |
| `task.cancel` | `task_id` | User cancelled the task |

### Messages: Backend → Frontend (Broadcasts)

| Type | Fields | Description |
|------|--------|-------------|
| `agent.status` | `status`, `metadata?` | Agent went ONLINE/OFFLINE/BUSY |
| `task.status` | `task_id`, `status`, `error?` | Task state changed |
| `task.event` | `task_id`, `event_type`, `data`, `sequence` | New Claude output event |
| `approval.needed` | `task_id`, `data`, `sequence` | Approval gate hit — frontend shows approval card |

### Messages: Frontend → Backend

| Type | Fields | Description |
|------|--------|-------------|
| `approval.response` | `task_id`, `action`, `response`, `sequence?` | User response to approval gate (approve/reject/message) |
| `task.cancel` | `task_id` | User cancels a running task |

## Communication Flows

### 1. Runner Registration

```
Runner                          Backend                         Frontend
  │                               │                               │
  ├─ WS CONNECT (?key=tok_ta_)──>│                               │
  │                           Verify API key (SHA-256 lookup)     │
  │                           Join runner group                   │
  │  ACCEPT                  <────│                               │
  │                               │                               │
  │ {"type":"register",           │                               │
  │  "metadata":{                 │                               │
  │    "hostname":"dev-01",       │                               │
  │    "platform":"darwin",       │                               │
  │    "runner_version":"0.2.0",  │                               │
  │    "pid": 12345}}             │                               │
  │ ──────────────────────────>   │                               │
  │                           Set agent ONLINE                    │
  │                           Store metadata                      │
  │                           ──────── group_send ───────────────>│
  │                               │    {"type":"agent.status",    │
  │                               │     "status":"ONLINE"}        │
  │                               │                               │
  │                           Check for queued tasks              │
  │ {"type":"task.assign",   <────│                               │
  │  "task_id":"...",             │  (if any tasks were queued)   │
  │  "title":"...",               │                               │
  │  "prompt":"..."}              │                               │
```

### 2. Heartbeat Loop

```
Runner                          Backend
  │                               │
  │  (every 30 seconds)           │
  │                               │
  │ {"type":"heartbeat"}          │
  │ ──────────────────────────>   │
  │                           Update last_heartbeat               │
  │ {"type":"heartbeat.ack"}  <───│
  │                               │
  │  ... 30 seconds later ...     │
  │                               │
  │ {"type":"heartbeat"}          │
  │ ──────────────────────────>   │
  │ {"type":"heartbeat.ack"}  <───│
```

If 3 heartbeats are missed (90 seconds), the backend considers the agent as potentially dead.

### 3. Task Execution (Happy Path)

```
User                   Frontend              Backend                   Runner
  │                       │                     │                        │
  │ Create task           │                     │                        │
  │ ─────────────────────>│                     │                        │
  │                       │ POST /tasks/        │                        │
  │                       │ ───────────────────>│                        │
  │                       │                     │ Create AgentTask       │
  │                       │                     │ status: QUEUED         │
  │                       │                     │                        │
  │                       │                     │ group_send task.assign │
  │                       │                     │ ──────────────────────>│
  │                       │                     │                        │ Parse prompt
  │                       │                     │                        │
  │                       │                     │ {"task.accepted"}      │
  │                       │                     │ <──────────────────────│
  │                       │                     │ status: ASSIGNED       │
  │                       │ {"task.status":     │                        │
  │                       │  "ASSIGNED"}        │                        │ Create SDK
  │                       │ <───────────────────│                        │ client with
  │                       │                     │                        │ PreToolUse
  │                       │                     │                        │ hook
  │                       │                     │                        │
  │                       │                     │ {"task.event":         │ Stream SDK
  │                       │                     │  "TOOL_USE",           │ events
  │                       │                     │  "data":{"tool_name":  │
  │                       │                     │   "Read",...}}         │
  │                       │                     │ <──────────────────────│
  │                       │                     │ Save TaskEvent         │
  │                       │                     │ status: RUNNING        │
  │                       │ {"task.event":      │ (first event, atomic)  │
  │ See live output       │  "TOOL_USE",...}    │                        │
  │ <─────────────────────│ <───────────────────│                        │
  │                       │                     │                        │
  │                       │                     │ ... more events ...    │
  │                       │                     │ <──────────────────────│
  │                       │ ... forwarded ...   │                        │
  │ <─────────────────────│ <───────────────────│                        │
  │                       │                     │                        │
  │                       │                     │ {"task.completed":     │ ResultMessage
  │                       │                     │  "result":"..."}       │
  │                       │                     │ <──────────────────────│
  │                       │                     │ status: COMPLETED      │
  │                       │                     │ agent: ONLINE          │
  │                       │ {"task.status":     │                        │
  │ Task complete         │  "COMPLETED"}       │                        │
  │ <─────────────────────│ <───────────────────│                        │
```

### 4. Approval Gate Flow

This is the core interactive feature. When Claude calls the `AskUserQuestion` tool, the SDK fires the runner's `PreToolUse` hook (registered with `matcher="AskUserQuestion"`), which bridges to the backend and awaits the user's response.

```
Runner                          Backend                         Frontend
  │                               │                               │
  │  PreToolUse hook fires for    │                               │
  │  AskUserQuestion tool call    │                               │
  │                               │                               │
  │ {"type":"approval.needed",    │                               │
  │  "task_id":"...",             │                               │
  │  "data":{                     │                               │
  │    "tool_name":               │                               │
  │      "AskUserQuestion",      │                               │
  │    "input":{                  │                               │
  │      "questions":[...]}},     │                               │
  │  "sequence": 42}              │                               │
  │ ──────────────────────────>   │                               │
  │                           Save TaskEvent                      │
  │                           (APPROVAL_NEEDED)                   │
  │                           Status: AWAITING_APPROVAL           │
  │                               │                               │
  │                               │ {"type":"approval.needed",    │
  │                               │  "task_id":"...",             │
  │                               │  "data":{...},               │
  │                               │  "sequence": 42}             │
  │                               │ ─────────────────────────────>│
  │                               │                               │
  │                               │                     Show approval card
  │                               │                     with question +
  │                               │                     [Approve] [Reject]
  │                               │                               │
  │  (PreToolUse hook callback     │                               │
  │   awaits Future resolution)   │                    User clicks
  │                               │                    [Approve]  │
  │                               │                               │
  │                               │ {"type":"approval.response",  │
  │                               │  "task_id":"...",             │
  │                               │  "action":"approve",          │
  │                               │  "response":"option 1"}      │
  │                               │ <─────────────────────────────│
  │                               │                               │
  │                           Save TaskEvent                      │
  │                           (APPROVAL_RESPONSE)                 │
  │                           Status: RUNNING                     │
  │                               │                               │
  │ {"type":"approval.response",  │                               │
  │  "task_id":"...",             │                               │
  │  "action":"approve",          │                               │
  │  "response":"option 1"}      │                               │
  │ <─────────────────────────────│                               │
  │                               │                               │
  │ Hook returns deny with        │                               │
  │ user's answer as reason       │                               │
  │                               │                               │
  │ SDK resumes execution...      │                               │
```

### 5. Task Cancellation

```
User                   Frontend              Backend                   Runner
  │                       │                     │                        │
  │ Click [Cancel]        │                     │                        │
  │ ─────────────────────>│                     │                        │
  │                       │ {"task.cancel":     │                        │
  │                       │  "task_id":"..."}   │                        │
  │                       │ ───────────────────>│                        │
  │                       │                     │ Status: CANCELLED      │
  │                       │                     │                        │
  │                       │                     │ group_send task_cancel │
  │                       │                     │ ──────────────────────>│
  │                       │                     │                        │ Call SDK
  │                       │                     │                        │ client.interrupt()
  │                       │                     │                        │
  │                       │                     │ {"task.failed":        │
  │                       │                     │  "error":"Cancelled"}  │
  │                       │                     │ <──────────────────────│
```

### 6. WebSocket Disconnect Recovery

```
Runner                          Backend                         Frontend
  │                               │                               │
  │  (executing task,             │                               │
  │   streaming events)           │                               │
  │                               │                               │
  │  ──── NETWORK DROPS ────      │                               │
  │                               │                               │
  │  SDK keeps executing           │ Detects disconnect            │
  │  Runner buffers events        │ Sets agent: OFFLINE           │
  │  in memory deque              │ ─────────────────────────────>│
  │                               │ {"agent.status":"OFFLINE"}    │
  │                               │                               │
  │  Reconnect attempt 1          │                               │
  │  (1s backoff)                 │                               │
  │  ─── STILL DOWN ───          │                               │
  │                               │                               │
  │  Reconnect attempt 2          │                               │
  │  (2s backoff)                 │                               │
  │  ─── STILL DOWN ───          │                               │
  │                               │                               │
  │  Reconnect attempt 3          │                               │
  │  (4s backoff)                 │                               │
  │  ──── SUCCESS! ────           │                               │
  │                               │                               │
  │ WS CONNECT (?key=tok_ta_)───>│                               │
  │ {"type":"register",...}  ────>│ Set agent: ONLINE             │
  │                               │ ─────────────────────────────>│
  │                               │ {"agent.status":"ONLINE"}     │
  │                               │                               │
  │  Flush buffered events        │                               │
  │ {"task.event",...}       ────>│ Save + forward                │
  │ {"task.event",...}       ────>│ Save + forward                │
  │ {"task.event",...}       ────>│ Save + forward                │
  │                               │ ─────────────────────────────>│
  │  Continue streaming           │                               │
  │  new events normally          │                               │
```

## Task Event Types

Events streamed from Claude are classified into these types:

| Event Type | Source | Description | Data Fields |
|------------|--------|-------------|-------------|
| `LOG` | Claude text output | General output text | `message`, `text` |
| `TOOL_USE` | Claude calls a tool | Tool invocation | `tool_name`, `file_path`, `command`, `pattern` |
| `TOOL_RESULT` | Tool returns | Tool execution result | `tool_use_id`, `content` |
| `ERROR` | Claude error | Error message | `message`, `error` |
| `STATUS_CHANGE` | Task status change | Status transition | `old_status`, `new_status` |
| `APPROVAL_NEEDED` | AskUserQuestion tool | Approval gate triggered | `question`, `options` |
| `APPROVAL_RESPONSE` | User response | User's approval decision | `action`, `response` |

### Tool-Specific Data Extraction

The `stream_parser` extracts relevant fields per tool from SDK `StreamEvent` objects to avoid sending full tool inputs:

| Tool | Extracted Fields |
|------|------------------|
| Read | `file_path` |
| Edit | `file_path`, `old_string` (truncated), `new_string` (truncated) |
| Write | `file_path` |
| Bash | `command`, `description` |
| Grep | `pattern`, `path`, `glob` |
| Glob | `pattern`, `path` |
| WebFetch | `url` |
| WebSearch | `query` |

## Frontend UI Architecture

### Routes

| Route | Page | Description |
|-------|------|-------------|
| `/[orgSlug]/toony-agents/` | List page | Card grid of registered bots with status badges |
| `/[orgSlug]/toony-agents/[slug]/` | Detail page | Bot info + task list table |
| `/[orgSlug]/toony-agents/[slug]/tasks/[taskId]/` | Task view | Hybrid dashboard + chat |

### Components

```
components/toony-agents/
├── toony-agent-status-badge.tsx   # OFFLINE (gray) / ONLINE (green) / BUSY (blue)
├── register-bot-modal.tsx         # Name + slug form, creates ToonyAgent
├── manage-keys-modal.tsx          # List/generate/revoke API keys
├── create-task-modal.tsx          # Title + prompt form, creates AgentTask
├── task-pipeline-panel.tsx        # Left panel: auto-grouped stages with timers
├── task-live-output.tsx           # Right panel: scrollable event list + input
├── task-event-item.tsx            # Single event renderer (switches on event_type)
├── approval-gate-card.tsx         # Interactive approve/reject/message card
└── task-input-box.tsx             # Chat-style text input at bottom
```

### Task View Layout

The task view is a split-panel layout:

```
┌─────────────────────────┬─────────────────────────────────────────────────┐
│ Pipeline (25%)          │ Live Output (75%)                               │
│                         │                                                 │
│ ✅ Exploring            │ ▸ Read src/auth/login.ts                        │
│    3 actions, 12s       │ ▸ Grep "handleLogin" src/                       │
│                         │ ▸ Read src/auth/service.ts                      │
│ ⚡ Implementing          │                                                 │
│    2 actions, 8s        │ ▸ Edit src/auth/login.ts                        │
│                         │ ▸ Write src/auth/utils.ts                       │
│ 🧪 Testing              │                                                 │
│    1 action ⏱ 5s        │ ▸ Bash: npm test                                │
│    (active, pulsing)    │                                                 │
│                         │ ┌───────────────────────────────────────────┐   │
│ ⏳ Processing            │ │ ⚠ APPROVAL NEEDED                        │   │
│    (pending)            │ │                                           │   │
│                         │ │ "Should I also update the auth tests?"    │   │
│                         │ │                                           │   │
│                         │ │ [Approve]  [Reject]                       │   │
│                         │ │                                           │   │
│                         │ │ [Type a response...]  [Send]              │   │
│                         │ └───────────────────────────────────────────┘   │
│                         │                                                 │
│                         │ ┌───────────────────────────────────────────┐   │
│                         │ │ [Type a message...]                [Send] │   │
│                         │ └───────────────────────────────────────────┘   │
└─────────────────────────┴─────────────────────────────────────────────────┘
```

**Pipeline panel** auto-groups events into stages:
- Events with Read/Grep/Glob tools → "Exploring"
- Events with Edit/Write tools → "Implementing"
- Bash events containing "test"/"pytest" → "Testing"
- Other events → "Processing"

**Live output panel** shows:
- Event items rendered by type (tool calls, logs, errors)
- Approval gate cards inline (amber border when pending, grayed when resolved)
- Auto-scrolls to bottom on new events
- Chat input box at bottom for free-text messages

### WebSocket Hook

```typescript
const { readyState, sendApproval, cancelTask } = useToonyAgentWebSocket({
  agentId: "uuid-of-agent",
  onEvent: (event: ToonyAgentWsEvent) => {
    // Handle: agent.status, task.status, task.event, approval.needed
  },
});

// Send approval response
sendApproval(taskId, "approve", "option 1");

// Cancel a task
cancelTask(taskId);
```

## REST API Endpoints

All endpoints are scoped under `/api/v1/organizations/<org_slug>/toony-agents/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/toony-agents/` | List registered bots for this org |
| POST | `/toony-agents/` | Register a new bot |
| GET | `/toony-agents/<slug>/` | Get bot details |
| PUT | `/toony-agents/<slug>/` | Update bot |
| DELETE | `/toony-agents/<slug>/` | Delete bot |
| GET | `/toony-agents/<slug>/keys/` | List API keys |
| POST | `/toony-agents/<slug>/keys/` | Generate new API key |
| DELETE | `/toony-agents/<slug>/keys/<id>/` | Revoke an API key |
| GET | `/toony-agents/<slug>/tasks/` | List tasks for this bot |
| POST | `/toony-agents/<slug>/tasks/` | Create a new task |
| GET | `/toony-agents/<slug>/tasks/<id>/` | Get task details |
| POST | `/toony-agents/<slug>/tasks/<id>/cancel/` | Cancel a task |
| GET | `/toony-agents/<slug>/tasks/<id>/events/` | List task events |

## Security Considerations

1. **API keys are hashed** — only SHA-256 hashes stored in database. Raw keys shown once.
2. **Task ownership validated** — runner can only modify its own tasks. Frontend users can only interact with tasks from their organizations.
3. **WebSocket auth** — separate auth mechanisms per consumer (API key vs JWT).
4. **Input validation** — event types validated against allowed values. Missing `task_id` returns error.
5. **Rate limiting** — not yet implemented (future consideration).
6. **Key rotation** — keys can be revoked and new ones generated without downtime.
