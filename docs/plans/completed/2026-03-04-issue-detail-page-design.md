# Issue Detail Page & Inline Editing Design

## Summary

Two changes to the issue experience:

1. **Full-page issue detail** — clicking an issue navigates to a dedicated page instead of opening a modal.
2. **Inline title/description editing** — editable only when status is BACKLOG or TODO, with backend validation.

## 1. Full-Page Issue Detail

### Route

`app/(dashboard)/[orgSlug]/projects/[projectSlug]/issues/[identifier]/page.tsx`

### Layout

Same structure as the current `IssueDetailModal`:
- Back button to return to project issues tab
- Title + description (top)
- Comments / Activity tabs (bottom-left)
- Properties sidebar (right): status, priority, assignee, milestone, cycle, labels, estimate, due date

### Navigation Changes

- `KanbanBoard` and `IssuesList` `onIssueClick` callbacks change from setting modal state to `router.push(`/${orgSlug}/projects/${projectSlug}/issues/${issue.identifier}`)`.
- Remove `IssueDetailModal` import and usage from the project detail page's `IssuesTab`.
- Remove `selectedIssueId` state from `IssuesTab`.

### WebSocket

The new page uses `useProjectWebSocket` directly (same as the current modal uses via parent), subscribing to comment events for the specific issue.

## 2. Inline Title/Description Editing

### Frontend Behavior

- A pencil icon appears next to the title and description when:
  - Issue status is `BACKLOG` or `TODO`, AND
  - User has edit permissions (`canManage`)
- Clicking the icon converts the field into an editable input (title) or textarea (description).
- Save on Enter (title) or blur. Cancel on Escape.
- While saving, show a brief loading indicator.
- On error, revert to previous value and show error feedback.

### Backend Validation

In `issue_service.py` `update_issue()`, before applying `title` or `description` changes:

```python
if ("title" in kwargs or "description" in kwargs) and issue.status not in (
    IssueStatus.BACKLOG, IssueStatus.TODO
):
    raise ValidationError(
        "Title and description can only be edited when the issue is in BACKLOG or TODO status."
    )
```

Returns 400 Bad Request with the error message.

## Files Changed

### Backend
- `backend/projects/services/issue_service.py` — add status validation for title/description

### Frontend
- **New:** `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/issues/[identifier]/page.tsx` — full-page issue detail
- `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx` — remove modal usage, change click to navigation
- `frontend/components/issues/kanban-board.tsx` — no changes needed (callback signature stays the same)
- `frontend/components/issues/issues-list.tsx` — no changes needed (callback signature stays the same)
