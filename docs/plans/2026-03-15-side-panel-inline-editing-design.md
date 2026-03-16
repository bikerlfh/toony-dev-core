# Side Panel Inline Editing — Design

**Date:** 2026-03-15

## Goal

Add inline editing of issue title and description to the `IssueSidePanel` component (Tasks page), matching the existing behavior in the issue detail page.

## Changes

### `IssueSidePanel` (`components/tasks/issue-side-panel.tsx`)

- Add `onUpdated?: () => void` callback prop to notify parent on save.
- Add inline editing state for title (`editingTitle`, `titleDraft`, `isSavingTitle`) and description (`editingDescription`, `descriptionDraft`, `isSavingDescription`).
- Editing is gated by `isEditable = status === "BACKLOG" || status === "TODO"`.
- **Title:** click-to-edit with `<input>`, Enter to save, Esc to cancel, Save/Cancel buttons.
- **Description:** click-to-edit with `<textarea>`, Esc to cancel, Save/Cancel buttons. Shows "Click to add a description..." placeholder when empty and editable.
- On save: call `updateIssue()`, refetch issue, invoke `onUpdated()`.
- Editable fields show `hover:bg-slate-800/40` and `cursor-text` on hover.

### `TasksPage` (`app/(dashboard)/tasks/page.tsx`)

- Pass `onUpdated={fetchIssues}` to `IssueSidePanel` so the kanban board refreshes after edits.

## What does NOT change

- No editing of status, priority, or other fields in the side panel.
- No modifications to the issue detail page.
- No new components — all logic is inline in the side panel, matching the detail page pattern.
