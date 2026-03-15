# Issue Side Panel — Agent Tasks & Resolved Workflow

## Overview

Extend the `IssueSidePanel` on the Tasks page to show:
1. Agent Tasks linked to the issue (ordered newest first)
2. The resolved workflow that would execute for the issue

Both sections appear at the bottom of the side panel, after labels. If no data exists, the section is hidden.

## Backend

### New endpoint: `GET /api/agent-tasks/?issue_id=<uuid>`

- **View:** `AgentTaskByIssueListView` (APIView, GET only)
- **Permission:** `IsAuthenticated`
- **Selector:** `list_tasks_by_issue(issue_id)` — filters `AgentTask.objects.filter(issue_id=issue_id)` with `select_related('toony_agent')`, ordered by `-created_at`
- **Output serializer:** includes `id`, `title`, `status`, `toony_agent` (id + name), `created_at`
- **URL:** top-level route in `toony_agents/urls.py`

## Frontend API Layer

### `lib/api/toony-agents.ts`
- `listAgentTasksByIssue(issueId)` → `GET /agent-tasks/?issue_id={issueId}`

### `lib/api/workflows.ts`
- `resolveWorkflowForIssue(issueId)` → `GET /workflows/resolve/{issueId}/`
- Handle 404 gracefully (return `null`)

### New type in `types/toony-agents.ts`
```typescript
interface AgentTaskByIssueItem {
  id: string;
  title: string;
  status: AgentTaskStatus;
  toony_agent: { id: string; name: string };
  created_at: string;
}
```

## Frontend Components (Enfoque B — Reusable)

### `<IssueAgentTasks issueId={string} />`
- Location: `components/tasks/issue-agent-tasks.tsx`
- Own fetch via `useEffect` + `listAgentTasksByIssue(issueId)`
- No tasks → renders nothing (`null`)
- Loading → small inline spinner
- Each item shows: agent name (subtle badge), task title, status badge
- Click → `window.open('/toony-agents/${agentId}/tasks/${taskId}', '_blank')`

### `<IssueResolvedWorkflow issueId={string} />`
- Location: `components/tasks/issue-resolved-workflow.tsx`
- Own fetch via `useEffect` + `resolveWorkflowForIssue(issueId)`
- No workflow (404) → renders nothing (`null`)
- Loading → small inline spinner
- Shows: "Workflow" header + workflow name as link to `/workflows/${id}/edit`

### Integration in `IssueSidePanel`
- Mount both components after the labels section
- Independent loading (issue data shows immediately)

## Decisions

- **Enfoque B** chosen for components (reusability needed for upcoming feature)
- **Independent loading** per section (no blocking between issue, tasks, workflow)
- **New backend endpoint** `GET /api/agent-tasks/` with `issue_id` filter (vs nesting under agents)
- **Workflow link** goes to `/workflows/{id}/edit`
