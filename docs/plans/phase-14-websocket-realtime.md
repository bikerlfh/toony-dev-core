# Phase 14: WebSocket Infrastructure & Real-Time

## Context

All WebSocket infrastructure prerequisites are already in place: `daphne` and `channels` in `INSTALLED_APPS`, `channels-redis` configured in `CHANNEL_LAYERS` pointing at the running Redis 7 instance, uvicorn serving the ASGI app with WebSocket support, and `config/asgi.py` containing a `ProtocolTypeRouter` with a placeholder comment for Phase 14. No new Python packages are required.

Phase 14 wires two WebSocket endpoints into the system:
- `ws/projects/{project_id}/` — broadcasts issue and comment CRUD events to all connected project members for real-time board updates
- `ws/agents/{agent_id}/` — bidirectional channel for agent task assignment, results, status, and heartbeat

---

## Plan

### A. JWT WebSocket Auth Middleware

**New:** `backend/common/middleware.py`
- `JwtAuthMiddleware` — ASGI middleware that reads `?token=<jwt>` from the WebSocket URL query string, validates with SimpleJWT's `AccessToken`, and populates `scope["user"]` (or `AnonymousUser` if invalid/missing)
- Wraps the `URLRouter` in `config/asgi.py`, not listed in Django's `MIDDLEWARE` setting

### B. Broadcast Utility

**New:** `backend/common/broadcast.py`
- `broadcast(group_name, event_type, data)` — synchronous helper that calls `async_to_sync(channel_layer.group_send)` to push events from sync service functions
- No-ops gracefully when `get_channel_layer()` returns `None` (test environments)

### C. Project Consumer

**New:** `backend/projects/consumers.py`
- `ProjectConsumer(AsyncJsonWebsocketConsumer)` at `ws/projects/<project_id>/`
- `connect()`: authenticate user, verify org membership for the project via `OrganizationMembership`, join group `project_{project_id}`. Close with `4001` (no auth) or `4003` (no access)
- `disconnect()`: leave group
- `receive_json()`: no-op (server-push only)
- Group handlers: `issue_created`, `issue_updated`, `issue_deleted`, `comment_created`, `comment_updated`, `comment_deleted` — each sends JSON to client

### D. Agent Consumer

**New:** `backend/agents/consumers.py`
- `AgentConsumer(AsyncJsonWebsocketConsumer)` at `ws/agents/<agent_id>/`
- `connect()`: authenticate, verify org membership for agent's org, join group `agent_{agent_id}`
- `receive_json()`: handles `task.result` (placeholder), `status.update` (updates `Agent.status`), `heartbeat` (responds with `heartbeat.ack`)
- Group handler: `task_assign` — forwards task data to client

### E. WebSocket URL Routing

**New:** `backend/projects/routing.py` — `websocket_urlpatterns` with `ProjectConsumer`
**New:** `backend/agents/routing.py` — `websocket_urlpatterns` with `AgentConsumer`
**New:** `backend/config/routing.py` — aggregates both routing modules

### F. Wire ASGI Application

**Modify:** `backend/config/asgi.py`
- Add `"websocket"` key to `ProtocolTypeRouter` wrapping `URLRouter` in `JwtAuthMiddleware`
- Import routing from `config/routing.py`

### G. Broadcast Calls in Issue Service

**Modify:** `backend/projects/services/issue_service.py`
- After `create_issue`'s `transaction.atomic()` block: serialize with `IssueListSerializer`, broadcast `issue.created`
- After `update_issue`'s `transaction.atomic()` block: serialize and broadcast `issue.updated`
- In `delete_issue`: capture `project_id` and `issue.id` before delete, broadcast `issue.deleted` with `{ id }`
- After `create_comment`'s `transaction.atomic()` block: serialize with `IssueCommentSerializer`, broadcast `comment.created` with `{ issue_id, comment }`
- In `update_comment`: serialize and broadcast `comment.updated`
- In `delete_comment`: capture IDs before delete, broadcast `comment.deleted` with `{ issue_id, comment_id }`

### H. Frontend WebSocket Types

**New:** `frontend/types/websocket.ts`
- `ProjectWsEvent` union: `IssueCreatedEvent | IssueUpdatedEvent | IssueDeletedEvent | CommentCreatedEvent | CommentUpdatedEvent | CommentDeletedEvent`
- `AgentWsEvent` union: `TaskAssignEvent | HeartbeatAckEvent`
- `WsReadyState` type

**Modify:** `frontend/types/index.ts` — re-export websocket types

### I. Generic Reconnecting WebSocket Hook

**New:** `frontend/hooks/use-websocket.ts`
- `useWebSocket({ url, onMessage, onOpen?, onClose?, reconnect?, ... })` — native browser `WebSocket` with exponential-backoff reconnection
- Stable callback refs to avoid reconnection on re-render
- Skips reconnect on close codes `4001`/`4003` (auth failures)
- Clean teardown on unmount (nullify handlers before close)
- Returns `{ readyState, send }`

### J. Project-Specific WebSocket Hook

**New:** `frontend/hooks/use-project-websocket.ts`
- `useProjectWebSocket({ projectId, onEvent })` — builds WS URL from `NEXT_PUBLIC_WS_URL` env var + `getAccessToken()`
- Parses incoming messages as `ProjectWsEvent` and calls `onEvent`
- Returns `{ readyState }`

### K. Integrate WebSocket in IssuesTab

**Modify:** `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx`
- Pass `projectId` to `IssuesTab`, add `useProjectWebSocket` hook with surgical state updates
- Pass `wsEvent` to `IssueDetailModal`

### L. Integrate WebSocket in IssueDetailModal (Comments)

**Modify:** `frontend/components/issues/issue-detail-modal.tsx`
- Add optional `wsEvent` prop, handle `comment.*` events in `CommentsSection` via `useEffect`

### M. Agent WebSocket Hook

**New:** `frontend/hooks/use-agent-websocket.ts`
- `useAgentWebSocket({ agentId, onEvent })` with convenience wrappers for `sendTaskResult`, `sendStatusUpdate`, `sendHeartbeat`

---

## WebSocket Endpoints

| Endpoint | Direction | Description |
|----------|-----------|-------------|
| `ws/projects/{project_id}/?token=<jwt>` | Server -> Client | Issue and comment CRUD events for live board |
| `ws/agents/{agent_id}/?token=<jwt>` | Bidirectional | Task assignment, results, status, heartbeat |

### Event Types

| Event | Payload | Consumer |
|-------|---------|----------|
| `issue.created` | `IssueList` serializer shape | Project |
| `issue.updated` | `IssueList` serializer shape | Project |
| `issue.deleted` | `{ id }` | Project |
| `comment.created` | `{ issue_id, comment: IssueComment }` | Project |
| `comment.updated` | `{ issue_id, comment: IssueComment }` | Project |
| `comment.deleted` | `{ issue_id, comment_id }` | Project |
| `task.assign` | `{ task_id, skill_slug, input }` | Agent |
| `task.result` | `{ task_id, output }` | Agent (client->server) |
| `status.update` | `{ status }` | Agent (client->server) |
| `heartbeat` / `heartbeat.ack` | (empty) | Agent |

### Close Codes

| Code | Meaning |
|------|---------|
| `4001` | Missing or invalid JWT token |
| `4003` | Valid token but no org membership |

---

## Key Decisions

1. **Query-param token auth** — browsers can't set custom headers on WS upgrade; `?token=<jwt>` is the standard workaround
2. **`AsyncJsonWebsocketConsumer`** — JSON-native, async to avoid blocking the event loop under load
3. **`broadcast()` with `async_to_sync`** — bridges sync services to async channel layer; no-ops in tests
4. **Broadcast outside `transaction.atomic()`** — ensures data is committed before subscribers read it
5. **Surgical state updates** — `setIssues()` with map/filter instead of full REST re-fetch for instant UX
6. **Native browser WebSocket** — matches the project's lean dependency philosophy
7. **Stable callback refs** — `useRef` pattern prevents WebSocket reconnection on parent re-renders
8. **Auth close codes skip reconnect** — `4001`/`4003` don't trigger exponential backoff
