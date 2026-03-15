# Quick Create Issue Modal — Tasks Page

## Overview

Add a new "Create issue" button to the Tasks page filter bar and a Linear-style modal for quick issue creation across projects.

## Requirements

- New modal component (not reusing existing `CreateIssueModal`)
- Linear-inspired minimal design: inline title/description, pill buttons for fields
- Project is required (selector in pill bar)
- Status hardcoded to BACKLOG (non-interactive pill)
- All field pills functional: Priority, Assignee, Labels, plus expandable Milestone, Cycle, Estimate, Due date
- Dynamic data loading per selected project
- Button placed in filter bar, right-aligned

## Modal Layout

```
┌─────────────────────────────────────────────────────────┐
│  [ProjectChip] › New issue                        ✕     │
│                                                         │
│  Issue title                    (input, large, bold)    │
│                                                         │
│  Add description...             (textarea, auto-resize) │
│                                                         │
│                                                         │
│  [◎ Backlog] [--- Priority] [👤 Assignee]               │
│  [⬡ Project*] [▣ Labels] [...]                         │
│                                                         │
│                              [Create issue] (indigo)    │
└─────────────────────────────────────────────────────────┘
```

"..." expands inline to: `[Milestone] [Cycle] [Estimate] [Due date]` (replaces the "..." button).

## Component

**File:** `frontend/components/tasks/quick-create-issue-modal.tsx`

**Props:**
```typescript
interface QuickCreateIssueModalProps {
  projects: ProjectList[];
  onClose: () => void;
  onCreated: () => void;
}
```

## Behavior

### Header
- Shows selected project as chip (icon + name) or "Select project" placeholder
- Breadcrumb: `[ProjectChip] › New issue`
- Close via X button, backdrop click, or Escape key

### Main Fields
- **Title**: borderless `<input>`, large font, placeholder "Issue title". Required.
- **Description**: borderless `<textarea>`, placeholder "Add description...", auto-resize.

### Pill Bar
Each pill is a button that opens a dropdown/popover positioned below it.

| Pill | Behavior | Default |
|------|----------|---------|
| Backlog | Non-interactive, shows fixed status | Always BACKLOG |
| Priority | Dropdown: NONE, URGENT, HIGH, MEDIUM, LOW | NONE |
| Assignee | Dropdown: project members. Disabled if no project | None |
| Project | Dropdown: all projects. **Required** | None |
| Labels | Multi-select dropdown: project labels. Disabled if no project | None |
| "..." | Expands to show extra pills inline (disappears after click) | — |
| Milestone | Dropdown: project milestones. Disabled if no project | None |
| Cycle | Dropdown: project cycles. Disabled if no project | None |
| Estimate | Small numeric input (story points) | None |
| Due date | Date picker | None |

When a pill has a selected value, it displays the value instead of the placeholder text.

### Dynamic Data Loading
When a project is selected, fetch in parallel:
- `listProjectMembers(projectId)`
- `listMilestones(projectId)`
- `listCycles(projectId)`
- `listLabels()` (org-level)

When project changes: reset assignee, milestone, cycle, labels and re-fetch.

### Footer
- "Create issue" button (indigo-600). Disabled if title or project is empty.

## API Call

```typescript
createIssue(selectedProjectId, {
  title,
  description,
  status: "BACKLOG",
  priority,
  assignee_id,
  milestone_id,
  cycle_id,
  label_ids,
  estimate,
  due_date,
});
```

## Tasks Page Integration

Button in filter bar, right-aligned:

```tsx
<div className="mt-4 flex items-center gap-3">
  <Select ... />  {/* Project filter */}
  <Select ... />  {/* Priority filter */}
  <div className="ml-auto">
    <button onClick={() => setShowCreateModal(true)}>
      + Create issue
    </button>
  </div>
</div>

{showCreateModal && (
  <QuickCreateIssueModal
    projects={projects}
    onClose={() => setShowCreateModal(false)}
    onCreated={() => { setShowCreateModal(false); fetchIssues(); }}
  />
)}
```

## Visual Style

- Dark theme: `bg-slate-900`, borders `border-slate-800/60`
- Pills: `bg-slate-800 text-slate-300 rounded-full px-3 py-1.5`, hover `bg-slate-700`
- Dropdowns: `bg-slate-800 border-slate-700 rounded-lg shadow-xl`, hover items `bg-slate-700`
- Backdrop: `fixed inset-0 z-50 bg-black/60`
- Modal: `max-w-2xl`, vertically centered
- Create button: `bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white`
