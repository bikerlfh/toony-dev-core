# Agent Task Status on Issue Card

## Goal

Show the status of the latest AgentTask assigned to an issue on the kanban board issue card. If no AgentTask exists for the issue, show nothing.

## Approach

**Subquery annotation** on the `list_user_issues` selector — gets the latest agent task status in a single DB query with no N+1.

## Backend Changes

### Selector (`projects/selectors/issue_selector.py`)

Annotate `list_user_issues` queryset with a `Subquery`:

```python
from django.db.models import Subquery, OuterRef
from toony_agents.models import AgentTask

latest_task_status = AgentTask.objects.filter(
    issue=OuterRef("pk")
).order_by("-created_at").values("status")[:1]

qs = qs.annotate(latest_agent_task_status=Subquery(latest_task_status))
```

### Serializer (`projects/serializers/output.py`)

Add to `CrossProjectIssueListSerializer`:

```python
latest_agent_task_status = serializers.CharField(allow_null=True, default=None)
```

Add `"latest_agent_task_status"` to `fields`.

## Frontend Changes

### Type (`types/projects.ts`)

Add to `CrossProjectIssueList`:

```typescript
latest_agent_task_status: AgentTaskStatus | null;
```

### IssueCard (`components/tasks/tasks-kanban-board.tsx`)

In the bottom row, next to the assignee avatar, render a small robot/agent icon when `latest_agent_task_status` is non-null. The icon is colored by status with a tooltip showing the status label.

Status color mapping:
- QUEUED, PAUSED → `text-slate-500`
- ASSIGNED → `text-yellow-500`
- RUNNING → `text-blue-400` (with pulse animation)
- WAITING_FOR_ANSWER → `text-amber-500`
- COMPLETED → `text-emerald-500`
- FAILED → `text-red-500`
- CANCELLED → `text-slate-600`

The icon is a small (h-4 w-4) CPU/bot SVG icon, positioned to the left of the assignee avatar in the bottom-right area.

## Files Modified

1. `backend/apps/projects/selectors/issue_selector.py` — annotate queryset
2. `backend/apps/projects/serializers/output.py` — add field to serializer
3. `frontend/types/projects.ts` — extend `CrossProjectIssueList`
4. `frontend/components/tasks/tasks-kanban-board.tsx` — render status icon in `IssueCard`
