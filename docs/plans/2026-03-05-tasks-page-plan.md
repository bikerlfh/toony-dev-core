# Tasks Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a cross-project Tasks page with a kanban board showing all user issues, plus a backend endpoint to support it.

**Architecture:** New `GET /api/issues/` endpoint returns issues across all projects the user has membership in. Frontend `/tasks` page renders a kanban board (adapted from existing component) with project badges on cards, filters, drag-and-drop status changes, and a slide-over side panel for issue detail preview.

**Tech Stack:** Django 5 / DRF (backend), Next.js 15 / React 19 / Tailwind CSS v4 (frontend)

**Worktree:** `/Users/LuisMo/Documents/projects/toony-dev-core-tasks-page` (branch `feat/tasks-page`)

---

### Task 1: Backend — Selector `list_user_issues`

**Files:**
- Modify: `backend/projects/selectors/issue_selector.py` (append new function after line 59)
- Modify: `backend/projects/selectors/__init__.py` (add export)

**Step 1: Add the selector function**

Add to the end of `backend/projects/selectors/issue_selector.py`:

```python
def list_user_issues(user, *, filters=None, search=None):
    """List issues across all projects the user is a member of."""
    qs = Issue.objects.filter(
        project__memberships__user=user,
    ).select_related(
        "assignee", "project",
    ).prefetch_related("labels")

    if search:
        vector = SearchVector("title", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        qs = qs.annotate(rank=SearchRank(vector, query)).filter(rank__gte=0.01).order_by("-rank")
        return qs

    if filters:
        if "status" in filters:
            qs = qs.filter(status=filters["status"])
        if "priority" in filters:
            qs = qs.filter(priority=filters["priority"])
        if "assignee_id" in filters:
            qs = qs.filter(assignee_id=filters["assignee_id"])
        if "project_id" in filters:
            qs = qs.filter(project_id=filters["project_id"])

    return qs.order_by("sort_order", "-created_at")
```

**Step 2: Export from `__init__.py`**

In `backend/projects/selectors/__init__.py`, add the import:

```python
from projects.selectors.issue_selector import (
    ...
    list_user_issues,
)
```

And add `"list_user_issues"` to the `__all__` list.

**Step 3: Commit**

```bash
git add backend/projects/selectors/issue_selector.py backend/projects/selectors/__init__.py
git commit -m "feat(backend): add list_user_issues selector for cross-project issue listing"
```

---

### Task 2: Backend — Serializer for cross-project issues

The existing `IssueListSerializer` exposes `project_id` but not the project name/color needed for the frontend badge. Add a new serializer that nests minimal project info.

**Files:**
- Modify: `backend/projects/serializers/output.py` (add new serializer after `IssueListSerializer`, line 193)

**Step 1: Add the serializer**

Add after `IssueListSerializer` (line 193) in `backend/projects/serializers/output.py`:

```python
class _IssueProjectSerializer(serializers.ModelSerializer):
    """Minimal project info embedded in cross-project issue listings."""
    class Meta:
        model = Project
        fields = ["id", "name", "icon", "color"]
        read_only_fields = fields


class CrossProjectIssueListSerializer(serializers.ModelSerializer):
    assignee = UserDetailSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)
    project = _IssueProjectSerializer(read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "project_id",
            "project",
            "identifier",
            "title",
            "status",
            "priority",
            "assignee",
            "labels",
            "estimate",
            "due_date",
            "sort_order",
            "created_at",
        ]
        read_only_fields = fields
```

**Step 2: Commit**

```bash
git add backend/projects/serializers/output.py
git commit -m "feat(backend): add CrossProjectIssueListSerializer with nested project info"
```

---

### Task 3: Backend — View `UserIssueListView`

**Files:**
- Modify: `backend/projects/views/issue_views.py` (add new view class at the end)
- Modify: `backend/projects/views/__init__.py` (add export)

**Step 1: Add the view**

Add at the end of `backend/projects/views/issue_views.py`:

```python
class UserIssueListView(PaginatedViewMixin, APIView):
    """List issues across all projects the authenticated user belongs to."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = request.query_params.get("q")
        filters = {}
        for key in ("status", "priority", "assignee_id", "project_id"):
            val = request.query_params.get(key)
            if val:
                filters[key] = val

        issues = list_user_issues(request.user, filters=filters or None, search=search)
        return self.paginate(issues, CrossProjectIssueListSerializer, request)
```

Update the imports at the top of the file — add `list_user_issues` to the selectors import and `CrossProjectIssueListSerializer` to the serializers import:

```python
from projects.selectors import (
    ...
    list_user_issues,
)
from projects.serializers.output import (
    ...
    CrossProjectIssueListSerializer,
)
```

**Step 2: Export from `__init__.py`**

Add `UserIssueListView` to `backend/projects/views/__init__.py`:

```python
from projects.views.issue_views import (
    ...
    UserIssueListView,
)
```

**Step 3: Commit**

```bash
git add backend/projects/views/issue_views.py backend/projects/views/__init__.py
git commit -m "feat(backend): add UserIssueListView for GET /api/issues/"
```

---

### Task 4: Backend — URL registration

**Files:**
- Modify: `backend/config/urls.py` (add new path)

**Step 1: Add the URL**

In `backend/config/urls.py`, add a new path **before** the `api/projects/` line (so it doesn't get caught by the `<uuid:project_id>/` pattern):

```python
from projects.views import UserIssueListView

urlpatterns = [
    ...
    path("api/issues/", UserIssueListView.as_view(), name="user-issue-list"),
    path("api/projects/", include("projects.urls")),
    ...
]
```

**Step 2: Commit**

```bash
git add backend/config/urls.py
git commit -m "feat(backend): register GET /api/issues/ endpoint"
```

---

### Task 5: Backend — Tests for `GET /api/issues/`

**Files:**
- Create: `backend/tests/test_user_issues.py`

**Step 1: Write the tests**

```python
import pytest
from rest_framework import status

from tests.factories import (
    IssueFactory,
    MembershipFactory,
    OrganizationFactory,
    OrganizationSettingsFactory,
    ProjectFactory,
    ProjectMembershipFactory,
    ProjectSettingsFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = "/api/issues/"


class TestUserIssueList:
    def test_unauthenticated(self, api_client):
        response = api_client.get(URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_issues_across_projects(
        self, authenticated_client, user, organization
    ):
        # Create two projects with issues
        p1 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p1)
        ProjectMembershipFactory(project=p1, user=user, role="LEAD")

        p2 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p2)
        ProjectMembershipFactory(project=p2, user=user, role="LEAD")

        IssueFactory(project=p1, reporter=user)
        IssueFactory(project=p2, reporter=user)

        response = authenticated_client.get(URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_excludes_issues_from_non_member_projects(
        self, authenticated_client, user, organization
    ):
        # Project user is NOT a member of
        other_user = UserFactory()
        p_other = ProjectFactory(organization=organization, lead=other_user)
        ProjectSettingsFactory(project=p_other)
        ProjectMembershipFactory(project=p_other, user=other_user, role="LEAD")
        IssueFactory(project=p_other, reporter=other_user)

        # Project user IS a member of
        p_mine = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p_mine)
        ProjectMembershipFactory(project=p_mine, user=user, role="LEAD")
        IssueFactory(project=p_mine, reporter=user)

        response = authenticated_client.get(URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_filter_by_status(self, authenticated_client, user, organization):
        p = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p)
        ProjectMembershipFactory(project=p, user=user, role="LEAD")

        IssueFactory(project=p, reporter=user, status="TODO")
        IssueFactory(project=p, reporter=user, status="DONE")

        response = authenticated_client.get(URL, {"status": "TODO"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["status"] == "TODO"

    def test_filter_by_project_id(self, authenticated_client, user, organization):
        p1 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p1)
        ProjectMembershipFactory(project=p1, user=user, role="LEAD")

        p2 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p2)
        ProjectMembershipFactory(project=p2, user=user, role="LEAD")

        IssueFactory(project=p1, reporter=user)
        IssueFactory(project=p2, reporter=user)

        response = authenticated_client.get(URL, {"project_id": str(p1.id)})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["project_id"] == str(p1.id)

    def test_response_includes_project_info(
        self, authenticated_client, user, organization
    ):
        p = ProjectFactory(
            organization=organization, lead=user, color="#FF0000", icon="bug"
        )
        ProjectSettingsFactory(project=p)
        ProjectMembershipFactory(project=p, user=user, role="LEAD")
        IssueFactory(project=p, reporter=user)

        response = authenticated_client.get(URL)
        assert response.status_code == status.HTTP_200_OK
        issue = response.data["results"][0]
        assert "project" in issue
        assert issue["project"]["name"] == p.name
        assert issue["project"]["color"] == "#FF0000"
        assert issue["project"]["icon"] == "bug"
```

**Step 2: Run tests to verify they pass**

```bash
docker compose exec backend pytest tests/test_user_issues.py -v
```

Expected: All 6 tests PASS.

**Step 3: Commit**

```bash
git add backend/tests/test_user_issues.py
git commit -m "test(backend): add tests for GET /api/issues/ cross-project endpoint"
```

---

### Task 6: Frontend — `listAllIssues` API function

**Files:**
- Modify: `frontend/lib/api/issues.ts` (add new function)
- Modify: `frontend/lib/api/index.ts` (add export)
- Modify: `frontend/types/projects.ts` (add `CrossProjectIssueList` type)
- Modify: `frontend/types/index.ts` (add export)

**Step 1: Add the TypeScript type**

Add at the end of the Issue section in `frontend/types/projects.ts` (after `IssueFilters`, around line 323):

```typescript
export interface IssueProject {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface CrossProjectIssueList extends IssueList {
  project: IssueProject;
}
```

**Step 2: Export from `frontend/types/index.ts`**

Add `IssueProject` and `CrossProjectIssueList` to the projects re-exports.

**Step 3: Add the API function**

Add at the end of `frontend/lib/api/issues.ts`:

```typescript
export async function listAllIssues(
  filters?: {
    status?: IssueStatus;
    priority?: IssuePriority;
    assignee_id?: string;
    project_id?: string;
  },
  cursor?: string
): Promise<PaginatedResponse<CrossProjectIssueList>> {
  const params = new URLSearchParams();
  if (cursor) params.append("cursor", cursor);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.assignee_id) params.append("assignee_id", filters.assignee_id);
  if (filters?.project_id) params.append("project_id", filters.project_id);
  const qs = params.toString();
  const { data } = await api.get<PaginatedResponse<CrossProjectIssueList>>(
    `/issues/${qs ? `?${qs}` : ""}`
  );
  return data;
}
```

Import `CrossProjectIssueList` from `@/types` at the top of the file.

**Step 4: Export from `frontend/lib/api/index.ts`**

Add `listAllIssues` to the issues re-export block.

**Step 5: Commit**

```bash
git add frontend/types/projects.ts frontend/types/index.ts frontend/lib/api/issues.ts frontend/lib/api/index.ts
git commit -m "feat(frontend): add listAllIssues API function and CrossProjectIssueList type"
```

---

### Task 7: Frontend — Sidebar menu reorder + Tasks entry

**Files:**
- Modify: `frontend/components/sidebar.tsx` (reorder `NAV_ITEMS`, add Tasks entry)

**Step 1: Update `NAV_ITEMS`**

Reorder the array in `frontend/components/sidebar.tsx` to:

```tsx
const NAV_ITEMS: SidebarItem[] = [
  {
    label: "Dashboard",
    path: "",
    icon: (/* existing dashboard icon */),
  },
  {
    label: "Tasks",
    path: "/tasks",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    label: "Projects",
    path: "/projects",
    icon: (/* existing projects icon */),
  },
  {
    label: "Organizations",
    path: "/organizations",
    icon: (/* existing orgs icon */),
  },
  {
    label: "Teams",
    path: "/teams",
    icon: (/* existing teams icon */),
  },
  {
    label: "Labels",
    path: "/labels",
    icon: (/* existing labels icon */),
  },
  {
    label: "AI Studio",
    icon: (/* existing AI Studio icon */),
    children: [/* existing children */],
  },
];
```

The only changes are: (a) insert the new Tasks entry after Dashboard, (b) move Organizations after Projects.

**Step 2: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat(frontend): reorder sidebar — add Tasks, move Organizations after Projects"
```

---

### Task 8: Frontend — `TasksKanbanBoard` component

**Files:**
- Create: `frontend/components/tasks/tasks-kanban-board.tsx`

This is adapted from `frontend/components/issues/kanban-board.tsx`. Key differences:
- Uses `CrossProjectIssueList` instead of `IssueList`
- Issue cards include a project name badge (colored pill)
- `onStatusChange` receives `CrossProjectIssueList` instead of `IssueList`

**Step 1: Create the component**

Create `frontend/components/tasks/tasks-kanban-board.tsx` — adapted from the existing kanban board. The `IssueCard` sub-component adds a project badge between the identifier and priority badge:

```tsx
{/* Project badge */}
<span
  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white/90"
  style={{ backgroundColor: issue.project.color || "#6366f1" }}
>
  {issue.project.icon && <span>{issue.project.icon}</span>}
  {issue.project.name}
</span>
```

Full file mirrors the structure of `kanban-board.tsx` with type changed to `CrossProjectIssueList`.

**Step 2: Commit**

```bash
git add frontend/components/tasks/tasks-kanban-board.tsx
git commit -m "feat(frontend): add TasksKanbanBoard component with project badges"
```

---

### Task 9: Frontend — `IssueSidePanel` component

**Files:**
- Create: `frontend/components/tasks/issue-side-panel.tsx`

**Step 1: Create the component**

Slide-over panel that:
- Takes `projectId`, `issueId`, and `onClose` props
- Fetches issue detail via `getIssue(projectId, issueId)` on mount
- Renders: identifier, title, status badge, priority badge, description, assignee, labels, dates
- "Open full page" link navigates to `/projects/[projectId]/issues/[issueId]`
- Close via X button or clicking backdrop
- Uses `fixed inset-0 z-50` for backdrop, panel slides from right with `w-[480px]`

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { IssueDetail } from "@/types";
import { getIssue } from "@/lib/api";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";

interface IssueSidePanelProps {
  projectId: string;
  issueId: string;
  onClose: () => void;
}

export function IssueSidePanel({ projectId, issueId, onClose }: IssueSidePanelProps) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchIssue = useCallback(async () => {
    try {
      setIssue(await getIssue(projectId, issueId));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, issueId]);

  useEffect(() => {
    fetchIssue();
  }, [fetchIssue]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[480px] bg-slate-950 border-l border-slate-800/60 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/60 bg-slate-950 px-6 py-4">
          <span className="text-sm font-mono text-slate-500">
            {issue?.identifier}
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${projectId}/issues/${issueId}`}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Open full page
            </Link>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          </div>
        ) : issue ? (
          <div className="px-6 py-4 space-y-6">
            {/* Title */}
            <h2 className="text-lg font-semibold text-white">{issue.title}</h2>

            {/* Status + Priority */}
            <div className="flex items-center gap-3">
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
            </div>

            {/* Description */}
            {issue.description && (
              <div className="text-sm text-slate-400 whitespace-pre-wrap">
                {issue.description}
              </div>
            )}

            {/* Details grid */}
            <div className="space-y-3 text-sm">
              {issue.assignee && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Assignee</span>
                  <span className="text-slate-300">
                    {issue.assignee.first_name} {issue.assignee.last_name}
                  </span>
                </div>
              )}
              {issue.due_date && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Due date</span>
                  <span className="text-slate-300">{issue.due_date}</span>
                </div>
              )}
              {issue.milestone && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Milestone</span>
                  <span className="text-slate-300">{issue.milestone.name}</span>
                </div>
              )}
            </div>

            {/* Labels */}
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {issue.labels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-20 text-center text-sm text-slate-500">
            Issue not found
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify `StatusBadge` component exists**

Check that `frontend/components/status-badge.tsx` exists and accepts an `IssueStatus` type. If it only supports `ProjectStatus`, you may need to pass the status as-is or check its implementation.

**Step 3: Commit**

```bash
git add frontend/components/tasks/issue-side-panel.tsx
git commit -m "feat(frontend): add IssueSidePanel slide-over component"
```

---

### Task 10: Frontend — Tasks page

**Files:**
- Create: `frontend/app/(dashboard)/tasks/page.tsx`

**Step 1: Create the page**

The page:
1. Fetches issues via `listAllIssues(filters)` — refetch when filters change
2. Fetches projects via `listProjects()` for the project filter dropdown
3. Renders filter bar (project, priority, assignee dropdowns)
4. Renders `TasksKanbanBoard` with drag-and-drop
5. On card click, opens `IssueSidePanel`
6. On status drag-drop, calls `updateIssue(issue.project_id, issue.id, { status })` and optimistically updates

```tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import type { CrossProjectIssueList, ProjectList, IssueStatus, IssuePriority } from "@/types";
import { listAllIssues, listProjects, updateIssue } from "@/lib/api";
import { TasksKanbanBoard } from "@/components/tasks/tasks-kanban-board";
import { IssueSidePanel } from "@/components/tasks/issue-side-panel";

interface Filters {
  project_id?: string;
  priority?: IssuePriority;
  assignee_id?: string;
}

export default function TasksPage() {
  const [issues, setIssues] = useState<CrossProjectIssueList[]>([]);
  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});
  const [selectedIssue, setSelectedIssue] = useState<{ projectId: string; issueId: string } | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      const data = await listAllIssues(filters);
      setIssues(data.results);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const fetchProjects = useCallback(async () => {
    const data = await listProjects();
    setProjects(data.results);
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);
  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleStatusChange = useCallback(
    async (issue: CrossProjectIssueList, newStatus: IssueStatus) => {
      // Optimistic update
      setIssues((prev) =>
        prev.map((i) => (i.id === issue.id ? { ...i, status: newStatus } : i))
      );
      try {
        await updateIssue(issue.project_id, issue.id, { status: newStatus });
      } catch {
        // Revert on failure
        fetchIssues();
      }
    },
    [fetchIssues]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-3">
        {/* Project filter */}
        <select
          value={filters.project_id || ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              project_id: e.target.value || undefined,
            }))
          }
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={filters.priority || ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              priority: (e.target.value as IssuePriority) || undefined,
            }))
          }
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
          <option value="NONE">None</option>
        </select>
      </div>

      {/* Board */}
      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          </div>
        ) : (
          <TasksKanbanBoard
            issues={issues}
            onIssueClick={(issue) =>
              setSelectedIssue({ projectId: issue.project_id, issueId: issue.id })
            }
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      {/* Side panel */}
      {selectedIssue && (
        <IssueSidePanel
          projectId={selectedIssue.projectId}
          issueId={selectedIssue.issueId}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/\(dashboard\)/tasks/page.tsx
git commit -m "feat(frontend): add Tasks page with kanban board, filters, and side panel"
```

---

### Task 11: Frontend — Verify build

**Step 1: Run the frontend linter**

```bash
make lint-frontend
```

Expected: No errors.

**Step 2: Run the frontend build**

```bash
docker compose exec frontend ./node_modules/.bin/next build
```

Expected: Build succeeds.

**Step 3: Fix any TypeScript/lint errors if needed, then commit fixes**

---

### Task 12: Run all backend tests

**Step 1: Run the full backend test suite**

```bash
make test
```

Expected: All tests pass, including the new `test_user_issues.py`.

**Step 2: Fix any failures, commit fixes**

---

### Summary of commits

1. `feat(backend): add list_user_issues selector for cross-project issue listing`
2. `feat(backend): add CrossProjectIssueListSerializer with nested project info`
3. `feat(backend): add UserIssueListView for GET /api/issues/`
4. `feat(backend): register GET /api/issues/ endpoint`
5. `test(backend): add tests for GET /api/issues/ cross-project endpoint`
6. `feat(frontend): add listAllIssues API function and CrossProjectIssueList type`
7. `feat(frontend): reorder sidebar — add Tasks, move Organizations after Projects`
8. `feat(frontend): add TasksKanbanBoard component with project badges`
9. `feat(frontend): add IssueSidePanel slide-over component`
10. `feat(frontend): add Tasks page with kanban board, filters, and side panel`
