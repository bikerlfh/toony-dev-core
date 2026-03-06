# Tasks Page Design — Cross-Project Kanban Board

## Overview

New `/tasks` page that displays all issues across all projects the user has access to, rendered as a kanban board. Includes a slide-over side panel for issue detail preview.

## Backend

### New endpoint: `GET /api/issues/`

Returns issues from all projects the authenticated user is a member of.

**Query params:** `status`, `priority`, `assignee_id`, `project_id`, `q` (search text)

**Permission:** `IsAuthenticated` only (no project-scoping).

**Implementation:**

- **Selector:** `list_user_issues(user, filters=None, search=None)` in `projects/selectors/issue_selectors.py`
  - Query: `Issue.objects.filter(project__memberships__user=user)` with `select_related('assignee', 'project')` and `prefetch_related('labels')`
  - Apply filters and search the same way `list_project_issues` does
- **View:** `UserIssueListView(PaginatedViewMixin, APIView)` in `projects/views/issue_views.py`
  - Reuses `IssueListSerializer` for output
- **URL:** Registered in `projects/urls.py`, included in `config/urls.py` as `api/issues/`

## Frontend

### API function

Add to `lib/api/issues.ts`:

```ts
export async function listAllIssues(
  filters?: { status?: IssueStatus; priority?: IssuePriority; assignee_id?: string; project_id?: string },
  cursor?: string
): Promise<PaginatedResponse<IssueList>>
```

### Page: `app/(dashboard)/tasks/page.tsx`

**Layout:**
- Page title "Tasks"
- Filter bar: project dropdown, priority dropdown, assignee dropdown
- Kanban board (adapted from `components/issues/kanban-board.tsx`)
- Issue side panel (slides in from right on card click)

**Data fetching:** `useEffect` + `listAllIssues()` with filter state. Also fetches user's projects list for the project filter dropdown.

### Components

- **`components/tasks/tasks-kanban-board.tsx`** — Kanban board adapted from existing `kanban-board.tsx`. Issue cards include project name badge (small pill with project color).
- **`components/tasks/issue-side-panel.tsx`** — Slide-over panel showing issue detail. Fetches full detail via `getIssue(projectId, issueId)`. Includes "Open full page" link to `/projects/[projectId]/issues/[issueId]`. Closes via X button or backdrop click.

### Issue card additions

Each card shows:
- Issue identifier (e.g., "ENG-42")
- Project name badge (small colored pill)
- Title (2-line clamp)
- Priority badge
- Labels (max 3)
- Assignee avatar

### Drag and drop

Dragging an issue to a different status column calls `updateIssue(issue.project_id, issue.id, { status: newStatus })` and optimistically updates the board.

### Sidebar menu reorder

Update `NAV_ITEMS` in `components/sidebar.tsx`:

1. Dashboard (/)
2. Tasks (/tasks) — NEW, clipboard/checklist icon
3. Projects (/projects)
4. Organizations (/organizations)
5. Teams (/teams)
6. Labels (/labels)
7. AI Studio (collapsible group)

## Out of scope

- WebSocket real-time updates on Tasks page
- List/table view toggle
- Bulk operations
- Creating issues from Tasks page
