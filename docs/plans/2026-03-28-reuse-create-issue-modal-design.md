# Reuse Create Issue Modal

## Problem

Two separate create-issue modals exist:

- **`CreateIssueModal`** (`components/issues/create-issue-modal.tsx`) — traditional form, used in the projects page. Receives `projectId` + pre-fetched data as props.
- **`QuickCreateIssueModal`** (`components/tasks/quick-create-issue-modal.tsx`) — modern pill-bar UI with expand/collapse, dirty check, close confirmation. Used in the tasks page. Includes a project selector and self-fetches project data.

The Quick modal is the better UX. The old modal should be replaced.

## Decision

Refactor `QuickCreateIssueModal` to accept an optional `projectId` prop so it works in both contexts.

## Design

### Props

```typescript
interface QuickCreateIssueModalProps {
  projects?: ProjectList[];  // required when no projectId (tasks page)
  projectId?: string;        // when provided, skip project picker (projects page)
  onClose: () => void;
  onCreated: () => void;
}
```

### Behavior by context

| Context | `projectId` | `projects` | Project pill | Data fetch |
|---------|-------------|------------|-------------|------------|
| Projects page | provided | omitted | hidden | auto on mount |
| Tasks page | omitted | provided | shown (selectable) | on project change |

### Status

Fixed to "Backlog" in both contexts (no status selector).

### File changes

1. **Refactor `QuickCreateIssueModal`** — add optional `projectId`, conditional project pill, `useEffect` for auto-fetch on mount.
2. **Move** `QuickCreateIssueModal` + `PillDropdown` from `components/tasks/` to `components/issues/` (now shared).
3. **Update `projects/[id]/page.tsx`** — replace `CreateIssueModal` with `QuickCreateIssueModal`, pass only `projectId`.
4. **Update `tasks/page.tsx`** — fix import path after move.
5. **Delete** `components/issues/create-issue-modal.tsx`.
