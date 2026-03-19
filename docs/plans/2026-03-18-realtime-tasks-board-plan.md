# Real-time Tasks Kanban Board — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically move issue cards on the Tasks kanban board when status changes happen via agent tasks or other users.

**Architecture:** A new `UserIssuesConsumer` joins all the user's project groups on connect and forwards issue events. The frontend listens via a single WebSocket and updates card positions inline.

**Tech Stack:** Django Channels (AsyncJsonWebsocketConsumer), React hook, existing `useWebSocket` core hook

---

### Task 1: Backend — Add `UserIssuesConsumer`

**Files:**
- Modify: `backend/apps/projects/consumers.py`
- Modify: `backend/apps/projects/routing.py`

**Step 1: Add the consumer**

In `backend/apps/projects/consumers.py`, add a helper function and the new consumer class after the existing `ProjectConsumer`:

```python
@database_sync_to_async
def _get_user_project_ids(user):
    """Return project IDs for all projects where user is a member."""
    from projects.models import ProjectMembership
    return list(
        ProjectMembership.objects.filter(user=user)
        .values_list("project_id", flat=True)
    )


class UserIssuesConsumer(AsyncJsonWebsocketConsumer):
    """
    User-scoped WebSocket that aggregates issue events
    across all projects the user belongs to.
    Route: ws/issues/?token=<jwt>
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.project_ids = await _get_user_project_ids(user)
        self.group_names = [f"project_{pid}" for pid in self.project_ids]

        for group in self.group_names:
            await self.channel_layer.group_add(group, self.channel_name)

        await self.accept()

    async def disconnect(self, code):
        for group in getattr(self, "group_names", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        pass

    # --- Forward issue events ---

    async def issue_created(self, event):
        await self.send_json({"type": "issue.created", "data": event["data"]})

    async def issue_updated(self, event):
        await self.send_json({"type": "issue.updated", "data": event["data"]})

    async def issue_deleted(self, event):
        await self.send_json({"type": "issue.deleted", "data": event["data"]})

    # --- Ignore comment events (required handlers so Channels doesn't error) ---

    async def comment_created(self, event):
        pass

    async def comment_updated(self, event):
        pass

    async def comment_deleted(self, event):
        pass
```

**Step 2: Add the route**

In `backend/apps/projects/routing.py`, add the import and route:

```python
from django.urls import path

from projects.consumers import ProjectConsumer, UserIssuesConsumer

websocket_urlpatterns = [
    path("ws/projects/<uuid:project_id>/", ProjectConsumer.as_asgi()),
    path("ws/issues/", UserIssuesConsumer.as_asgi()),
]
```

**Step 3: Run backend tests to verify no regressions**

Run: `docker compose exec backend pytest -v`
Expected: All tests PASS (no WebSocket consumer tests exist — consumer is tested manually or via integration)

**Step 4: Commit**

```
feat(projects): add UserIssuesConsumer for cross-project real-time updates

- Add UserIssuesConsumer that joins all user's project groups
- Forward issue events, ignore comment events
- Add ws/issues/ route
```

---

### Task 2: Frontend — Create `useUserIssuesWebSocket` hook

**Files:**
- Create: `frontend/hooks/use-user-issues-websocket.ts`

**Step 1: Create the hook**

Create `frontend/hooks/use-user-issues-websocket.ts` — same pattern as `use-project-websocket.ts` but without `projectId`:

```typescript
"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { ProjectWsEvent, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseUserIssuesWebSocketOptions {
  enabled?: boolean;
  onEvent: (event: ProjectWsEvent) => void;
}

export function useUserIssuesWebSocket({
  enabled = true,
  onEvent,
}: UseUserIssuesWebSocketOptions): { readyState: WsReadyState } {
  const url = useMemo(() => {
    if (!enabled) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/issues/?token=${token}`;
  }, [enabled]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as ProjectWsEvent;
      if (event?.type) {
        onEvent(event);
      }
    },
    [onEvent],
  );

  const { readyState } = useWebSocket({
    url,
    onMessage: handleMessage,
  });

  return { readyState };
}
```

**Step 2: Run frontend lint**

Run: `make lint-frontend`
Expected: No lint errors

**Step 3: Commit**

```
feat(frontend): add useUserIssuesWebSocket hook

- Single WebSocket connection to ws/issues/ for cross-project issue events
- Same pattern as useProjectWebSocket without projectId
```

---

### Task 3: Frontend — Wire up WebSocket in Tasks page

**Files:**
- Modify: `frontend/app/(dashboard)/tasks/page.tsx`

**Step 1: Add the import and hook**

In `frontend/app/(dashboard)/tasks/page.tsx`, add the import:

```typescript
import { useUserIssuesWebSocket } from "@/hooks/use-user-issues-websocket";
import type { ProjectWsEvent } from "@/types";
```

**Step 2: Add the WebSocket event handler and hook call**

After the `handleStatusChange` callback (after line 58), add:

```typescript
const handleWsEvent = useCallback(
  (event: ProjectWsEvent) => {
    if (event.type === "issue.updated") {
      setIssues((prev) =>
        prev.map((i) =>
          i.id === event.data.id ? { ...i, ...event.data } : i
        )
      );
    } else if (event.type === "issue.deleted") {
      setIssues((prev) => prev.filter((i) => i.id !== event.data.id));
    } else if (event.type === "issue.created") {
      fetchIssues();
    }
  },
  [fetchIssues]
);

useUserIssuesWebSocket({ onEvent: handleWsEvent });
```

The `issue.updated` handler merges the updated fields into the existing issue inline — if status changed, React re-renders and the card moves to the new column. The `issue.deleted` handler removes the card. The `issue.created` handler refetches since we need the full `CrossProjectIssueList` shape (the broadcast sends `IssueList` which lacks the `project` nested object and `latest_agent_task_status`).

**Step 3: Run frontend lint**

Run: `make lint-frontend`
Expected: No lint errors

**Step 4: Commit**

```
feat(frontend): wire real-time updates into Tasks kanban board

- Listen for issue events via useUserIssuesWebSocket
- Update cards inline on issue.updated (moves columns on status change)
- Remove cards on issue.deleted
- Refetch on issue.created
```
