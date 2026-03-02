# Phase 9: Frontend — Issue Tracker UI

## Context

Phase 7 delivered the full backend for issues (Issue with auto-identifier, IssueComment, IssueActivity audit log, Label M2M). Phase 8 built the frontend for teams, projects, and labels. Phase 9 adds the issue tracker UI: Kanban board, list view with inline editing, issue detail modal with comments and activity timeline, filtering, and create issue modal.

---

## Implemented

### A. TypeScript Types & API Client

1. **Extended `frontend/types/projects.ts`** — Added issue types:
   - `IssueStatus` (6 states: BACKLOG → CANCELED)
   - `IssuePriority` (NONE, URGENT, HIGH, MEDIUM, LOW)
   - `IssueList`, `IssueDetail` (extends IssueList with description, reporter, milestone, cycle, etc.)
   - `CreateIssuePayload`, `UpdateIssuePayload`
   - `IssueFilters` (status, priority, assignee, milestone, cycle, labels)
   - `IssueComment`, `CreateCommentPayload`
   - `IssueActivity` (audit log entries)

2. **Updated `frontend/types/index.ts`** — Barrel re-exports for all issue types.

3. **Created `frontend/lib/api/issues.ts`** — Full issue API client:
   - `listIssues()` (with filter query params), `getIssue()`, `createIssue()`, `updateIssue()`, `deleteIssue()`
   - `listComments()`, `createComment()`, `updateComment()`, `deleteComment()`
   - `listActivities()`

4. **Updated `frontend/lib/api/index.ts`** — Barrel re-exports for issue APIs.

### B. Issue UI Components

5. **Created `frontend/components/issues/filter-bar.tsx`** — FilterBar with dropdowns for status, priority, assignee, milestone, cycle, labels (tag chips with remove), and clear filters button.

6. **Created `frontend/components/issues/kanban-board.tsx`** — KanbanBoard with 6 columns (BACKLOG → CANCELED), IssueCard sub-component showing identifier, title, priority badge, labels, assignee avatar.

7. **Created `frontend/components/issues/issues-list.tsx`** — IssuesList table with inline status/priority dropdown editing, identifier, title, assignee, labels (max 2 + overflow count), and due date columns.

8. **Created `frontend/components/issues/create-issue-modal.tsx`** — CreateIssueModal with fields: title, description, status, priority, assignee, estimate, milestone, cycle, due date, and label toggle buttons.

### C. Issue Detail Modal

9. **Created `frontend/components/issues/issue-detail-modal.tsx`** — Full issue detail modal:
   - **Header:** identifier, status badge, priority badge, close button
   - **Main content area:** title, description, comments/activity tabs
   - **Properties sidebar (right, 288px):** inline-editable status, priority, assignee, milestone, cycle, estimate, due date, label toggles, reporter display, timestamps, delete action
   - **Comments section:** list with author avatar/name/timestamp, edit/delete actions, new comment form
   - **Activity section:** timeline of actions (CREATED, UPDATED with field/old/new values, DELETED) with user avatars
   - **ActivityDescription component:** Renders human-readable activity text from structured activity data

### D. Issues Tab Integration

10. **Modified `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx`**:
    - Added "issues" to `Tab` type and `TABS` array (positioned after Overview)
    - Added `IssuesTab` component with:
      - Board/List view mode switcher
      - FilterBar integration
      - KanbanBoard and IssuesList toggling
      - CreateIssueModal triggered by "Create issue" button
      - IssueDetailModal triggered by clicking any issue
      - Parallel metadata fetch (members, milestones, cycles, labels) for filter bar and create modal
      - Inline status/priority change callbacks on list view

---

## File Manifest

**5 new files, 3 modified files:**

| Section | Files |
|---------|-------|
| A (Types/API) | `frontend/types/projects.ts` (modify), `frontend/types/index.ts` (modify), `frontend/lib/api/issues.ts`, `frontend/lib/api/index.ts` (modify) |
| B (Components) | `frontend/components/issues/filter-bar.tsx`, `frontend/components/issues/kanban-board.tsx`, `frontend/components/issues/issues-list.tsx`, `frontend/components/issues/create-issue-modal.tsx` |
| C (Detail) | `frontend/components/issues/issue-detail-modal.tsx` |
| D (Integration) | `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx` (modify) |

---

## Verification

- `./node_modules/.bin/next build` — passes with 0 TypeScript errors
- Issues tab visible on project detail page
- Board view: 6-column Kanban with issue cards
- List view: table with inline status/priority editing
- Filter bar: all dropdowns functional, label chips with remove, clear button
- Create issue modal: all fields, label toggle buttons
- Issue detail modal: properties sidebar, comments CRUD, activity timeline
- Delete issue with confirmation dialog
