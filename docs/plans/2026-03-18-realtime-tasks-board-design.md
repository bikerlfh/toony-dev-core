# Real-time Tasks Kanban Board — Design

## Goal

Automatically move issue cards on the Tasks kanban board when their status changes (e.g., via Claude Code agent tasks or other users), without requiring a page refresh.

## Approach

Create a **user-scoped WebSocket consumer** (`ws/issues/`) that subscribes to all the user's project groups and forwards issue events over a single connection. The Tasks page listens via a new hook and updates state inline.

## Backend

### New Consumer: `UserIssuesConsumer`

**File:** `backend/apps/projects/consumers.py`
**Route:** `ws/issues/?token=<jwt>`

On connect:
1. Authenticate user from JWT token (same pattern as `ProjectConsumer`)
2. Query all projects where user has a membership
3. Join each `project_{id}` channel group

Event handlers — forward issue events, ignore comment events:
- `issue_created` → send `{"type": "issue.created", "data": ...}`
- `issue_updated` → send `{"type": "issue.updated", "data": ...}`
- `issue_deleted` → send `{"type": "issue.deleted", "data": ...}`
- `comment_created` / `comment_updated` / `comment_deleted` → no-op

No new broadcasts needed — the existing `update_issue` service already broadcasts to `project_{id}` groups.

### Routing

Add `ws/issues/` path in `config/routing.py`.

## Frontend

### New Hook: `useUserIssuesWebSocket`

**File:** `frontend/hooks/use-user-issues-websocket.ts`

- Connects to `{WS_BASE}/ws/issues/?token={accessToken}`
- Takes `onEvent: (event: ProjectWsEvent) => void`
- Returns `{ readyState }`
- Same pattern as `useProjectWebSocket` but no `projectId` parameter

### Tasks Page Integration

**File:** `frontend/app/(dashboard)/tasks/page.tsx`

Wire up `useUserIssuesWebSocket` with handler:
- `issue.updated` → update issue inline in state (`setIssues(prev => prev.map(...))`) — card moves columns instantly
- `issue.created` → refetch issues (new issue may or may not match current filters)
- `issue.deleted` → remove from state

## Files Modified

1. `backend/apps/projects/consumers.py` — add `UserIssuesConsumer`
2. `backend/config/routing.py` — add `ws/issues/` route
3. `frontend/hooks/use-user-issues-websocket.ts` — new hook (create)
4. `frontend/app/(dashboard)/tasks/page.tsx` — wire up WebSocket hook
