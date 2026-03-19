# Agent Task Status on Issue Card — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the latest AgentTask status on each issue card in the Tasks kanban board. No agent task = nothing shown.

**Architecture:** Backend annotates `list_user_issues` queryset with a `Subquery` to get the most recent `AgentTask.status` per issue. `CrossProjectIssueListSerializer` exposes the annotated field. Frontend reads the new field and renders a colored icon with tooltip.

**Tech Stack:** Django ORM Subquery, DRF serializer, React/TypeScript, Tailwind CSS

---

### Task 1: Backend — Add `latest_agent_task_status` annotation to selector

**Files:**
- Modify: `backend/apps/projects/selectors/issue_selector.py:122-153` (the `list_user_issues` function)

**Step 1: Write the failing test**

Add a new test to `backend/tests/test_user_issues.py`:

```python
# Add AgentTaskFactory to imports at top:
# from tests.factories import AgentTaskFactory, ToonyAgentFactory

def test_includes_latest_agent_task_status(self, authenticated_client, user, organization):
    p = ProjectFactory(organization=organization, lead=user)
    ProjectSettingsFactory(project=p)
    ProjectMembershipFactory(project=p, user=user, role="LEAD")
    issue = IssueFactory(project=p, reporter=user)

    agent = ToonyAgentFactory(registered_by=user)
    AgentTaskFactory(
        organization=organization,
        project=p,
        issue=issue,
        toony_agent=agent,
        created_by=user,
        status="RUNNING",
    )

    response = authenticated_client.get(URL)
    assert response.status_code == status.HTTP_200_OK
    assert response.data["results"][0]["latest_agent_task_status"] == "RUNNING"

def test_latest_agent_task_status_null_when_no_tasks(self, authenticated_client, user, organization):
    p = ProjectFactory(organization=organization, lead=user)
    ProjectSettingsFactory(project=p)
    ProjectMembershipFactory(project=p, user=user, role="LEAD")
    IssueFactory(project=p, reporter=user)

    response = authenticated_client.get(URL)
    assert response.status_code == status.HTTP_200_OK
    assert response.data["results"][0]["latest_agent_task_status"] is None

def test_latest_agent_task_status_picks_most_recent(self, authenticated_client, user, organization):
    p = ProjectFactory(organization=organization, lead=user)
    ProjectSettingsFactory(project=p)
    ProjectMembershipFactory(project=p, user=user, role="LEAD")
    issue = IssueFactory(project=p, reporter=user)

    agent = ToonyAgentFactory(registered_by=user)
    AgentTaskFactory(
        organization=organization,
        project=p,
        issue=issue,
        toony_agent=agent,
        created_by=user,
        status="COMPLETED",
    )
    AgentTaskFactory(
        organization=organization,
        project=p,
        issue=issue,
        toony_agent=agent,
        created_by=user,
        status="RUNNING",
    )

    response = authenticated_client.get(URL)
    assert response.status_code == status.HTTP_200_OK
    # The second factory is more recent (created_at auto-set)
    assert response.data["results"][0]["latest_agent_task_status"] == "RUNNING"
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_user_issues.py -v`
Expected: 3 new tests FAIL with `KeyError: 'latest_agent_task_status'`

**Step 3: Implement the selector annotation**

In `backend/apps/projects/selectors/issue_selector.py`, add import at top:

```python
from django.db.models import OuterRef, Subquery
from toony_agents.models import AgentTask
```

Then in `list_user_issues`, after the initial `qs` is built (line 135), add the annotation before the `if search:` block:

```python
    latest_task = (
        AgentTask.objects.filter(issue=OuterRef("pk"))
        .order_by("-created_at")
        .values("status")[:1]
    )
    qs = qs.annotate(latest_agent_task_status=Subquery(latest_task))
```

**Step 4: Add field to serializer**

In `backend/apps/projects/serializers/output.py`, in `CrossProjectIssueListSerializer`:

Add field declaration (after `cycle` line ~231):
```python
latest_agent_task_status = serializers.CharField(allow_null=True, default=None)
```

Add `"latest_agent_task_status"` to the `fields` list (after `"created_at"`).

**Step 5: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_user_issues.py -v`
Expected: All tests PASS

**Step 6: Run full test suite to check for regressions**

Run: `docker compose exec backend pytest -v`
Expected: All tests PASS

**Step 7: Commit**

```
feat(projects): annotate cross-project issues with latest agent task status

- Add Subquery annotation in list_user_issues selector
- Add latest_agent_task_status field to CrossProjectIssueListSerializer
- Add tests for agent task status on user issues endpoint
```

---

### Task 2: Frontend — Update type and render agent task status icon

**Files:**
- Modify: `frontend/types/projects.ts:338-340` (the `CrossProjectIssueList` interface)
- Modify: `frontend/components/tasks/tasks-kanban-board.tsx:117-216` (the `IssueCard` component)

**Step 1: Update the TypeScript type**

In `frontend/types/projects.ts`, add import at the top:

```typescript
import type { AgentTaskStatus } from "./toony-agents";
```

Then change `CrossProjectIssueList`:

```typescript
export interface CrossProjectIssueList extends IssueList {
  project: IssueProject;
  latest_agent_task_status: AgentTaskStatus | null;
}
```

**Step 2: Add agent task status icon to IssueCard**

In `frontend/components/tasks/tasks-kanban-board.tsx`, add the import at top:

```typescript
import type { AgentTaskStatus } from "@/types/toony-agents";
```

Add a helper function above the `IssueCard` component (before line 117):

```typescript
const AGENT_TASK_STATUS_CONFIG: Record<AgentTaskStatus, { color: string; label: string; pulse?: boolean }> = {
  QUEUED: { color: "text-slate-500", label: "Queued" },
  PAUSED: { color: "text-slate-500", label: "Paused" },
  ASSIGNED: { color: "text-yellow-500", label: "Assigned" },
  RUNNING: { color: "text-blue-400", label: "Running", pulse: true },
  WAITING_FOR_ANSWER: { color: "text-amber-500", label: "Waiting for Answer" },
  COMPLETED: { color: "text-emerald-500", label: "Completed" },
  FAILED: { color: "text-red-500", label: "Failed" },
  CANCELLED: { color: "text-slate-600", label: "Cancelled" },
};
```

Then in the IssueCard JSX, in the bottom row `div` (the one with `mt-2.5 flex items-center justify-between`), add the agent task icon between the labels area and the assignee avatar. Wrap the assignee + agent icon in a flex container on the right side:

```tsx
{/* Right side: agent task status + assignee */}
<div className="flex items-center gap-1.5">
  {issue.latest_agent_task_status && (() => {
    const cfg = AGENT_TASK_STATUS_CONFIG[issue.latest_agent_task_status];
    return (
      <div
        className={`${cfg.color} ${cfg.pulse ? "animate-pulse" : ""}`}
        title={cfg.label}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
        </svg>
      </div>
    );
  })()}
  {issue.assignee && (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-400"
      title={`${issue.assignee.first_name} ${issue.assignee.last_name}`}
    >
      {issue.assignee.first_name?.[0]}{issue.assignee.last_name?.[0]}
    </div>
  )}
</div>
```

Note: The SVG is the Heroicons "cpu-chip" icon — a small chip/circuit board that represents an agent.

**Step 3: Verify frontend compiles**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds with no type errors

**Step 4: Run frontend lint**

Run: `make lint-frontend`
Expected: No lint errors

**Step 5: Commit**

```
feat(frontend): show agent task status icon on issue cards

- Add latest_agent_task_status to CrossProjectIssueList type
- Render colored cpu-chip icon with tooltip in IssueCard bottom row
- Pulse animation for RUNNING status
```
