# Dashboard Design

## Overview

Personal dashboard for the authenticated user. Layout: "main column + sidebar" with a stats row at the top. Shows the user's issues, agent tasks, projects, and AI Studio status at a glance.

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [My Open Issues] [Urgent/High] [Agents Online]  [Tasks Running]    │
├────────────────────────────────────────┬────────────────────────────┤
│ My Issues (table + status pills)       │ Toony Agents (status list) │
│                                        │                            │
├────────────────────────────────────────┤ Active Workflows           │
│ Agent Tasks (table + status pills)     │                            │
│                                        ├────────────────────────────┤
├────────────────────────────────────────┤ Recent Artifacts           │
│ My Projects (cards grid 2col)          │                            │
└────────────────────────────────────────┴────────────────────────────┘
```

- Stats row: full width, 4 cards
- Main column: ~65% width
- Sidebar: ~35% width
- Responsive: on small screens, sidebar stacks below main

## Stats Row

4 compact stat cards in a horizontal row.

| Card | Value | Label | Subtext |
|------|-------|-------|---------|
| 1 | Count of assigned issues (status != DONE, CANCELED) | "My Open Issues" | — |
| 2 | Count of assigned issues with priority URGENT + HIGH | "Urgent / High" | Number colored red/orange |
| 3 | Count of Toony Agents with status ONLINE | "Agents Online" | "of {total} total" |
| 4 | Count of Agent Tasks with status RUNNING | "Tasks Running" | "{n} queued" |

Data sources:
- Cards 1-2: `listAllIssues()` filtered by assignee = current user
- Card 3: `listToonyAgents()`
- Card 4: iterate `listAgentTasks(agentId)` per agent via `Promise.all`

## My Issues (main column)

Compact table of issues assigned to the current user. Max 10 rows, "View all" links to `/tasks`.

- **Filter pills:** All, In Progress, Todo, In Review, Backlog (client-side filter)
- **Row data:** identifier, title (truncated), PriorityBadge, StatusBadge, project name (subtle)
- **Click:** opens IssueSidePanel (reuse existing component)
- **Sort:** by priority desc (URGENT > HIGH > MEDIUM > LOW > NONE), then updated_at desc
- **Empty state:** "No issues assigned to you" with link to `/tasks`

Data source: `listAllIssues()` filtered client-side by `assignee.id === currentUser.id`, excluding DONE/CANCELED.

## Agent Tasks (main column)

Compact table of agent tasks. Max 8 rows, "View all" link.

- **Filter pills:** All, Running, Queued, Completed, Failed (with counts)
- **Row data:** status dot (color-coded), title (truncated), agent name, status badge, relative time
- **Status colors:** RUNNING (amber + animate-pulse), QUEUED (slate), COMPLETED (emerald), FAILED (red), WAITING_FOR_ANSWER (purple), ASSIGNED (blue), CANCELLED (slate)
- **Click:** navigates to `/toony-agents/{agentSlug}/tasks/{taskId}`
- **Sort:** Running/Queued first, then created_at desc

Data source: `listToonyAgents()` then `Promise.all(agents.map(a => listAgentTasks(a.id)))`.

## My Projects (main column)

Compact cards in a 2-column grid within the main column. Max 6 projects, "View all" links to `/projects`.

- **Card data:** project icon/color, name, StatusBadge, issue_count, lead name (if exists)
- **Click:** navigates to `/projects/{id}`
- **Sort:** IN_PROGRESS first, then PLANNED, then by updated_at desc
- **Empty state:** "You're not a member of any project yet" with link to `/projects`

Data source: `listProjects()` (backend already filters by user membership).

## Toony Agents (sidebar)

Compact list of all Toony Agents with real-time status.

- **Each item:** status dot + agent name + status label
- **Subtext by status:**
  - ONLINE: "Last seen: {relative time from last_heartbeat}"
  - BUSY: "Running: {n} tasks"
  - OFFLINE: "Last seen: {relative time}" (dimmed text)
- **Status dots:** ONLINE (emerald + subtle pulse), BUSY (amber), OFFLINE (slate)
- **Click:** navigates to `/toony-agents/{id}`
- **"View" link:** navigates to `/toony-agents`

Data source: `listToonyAgents()` (shared with stats).

## Active Workflows (sidebar)

Compact list of active workflows. Max 5 items.

- **Each item:** workflow name, scope (Global / project name) + node count
- **Click:** navigates to `/workflows/{id}/edit`
- **"View" link:** navigates to `/workflows`
- **Only `is_active: true` workflows**
- **Empty state:** "No active workflows"

Data source: `listWorkflows()` filtered client-side by `is_active === true`.

## Recent Artifacts (sidebar)

Compact list of recent artifacts. Max 5 items.

- **Each item:** title, ArtifactTypeBadge + ArtifactStatusBadge, relative time
- **Click:** navigates to issue: `/projects/{projectId}/issues/{issueId}`
- **"View" link:** navigates to `/artifacts`
- **Sort:** created_at desc
- **Empty state:** "No artifacts yet"

Data source: `listAllArtifacts()`.

## Styling

Follows existing design system:
- Card containers: `bg-slate-900 rounded-xl border border-slate-800/60 p-4`
- Table rows: `hover:bg-slate-800/50 cursor-pointer transition-colors`
- Row dividers: `divide-y divide-slate-800/60`
- Stat numbers: `text-2xl font-semibold text-white`
- Labels: `text-sm text-slate-400`
- Subtext: `text-xs text-slate-500`
- Sidebar items: `py-3` spacing, `text-sm font-medium text-white` for names

## Existing Components to Reuse

- `StatusBadge` — project/milestone/cycle status
- `PriorityBadge` — issue priority
- `IssueSidePanel` — issue detail drawer
- `ArtifactTypeBadge`, `ArtifactStatusBadge` — artifact badges

## Responsive Behavior

- Desktop (lg+): 2-column layout (main + sidebar)
- Tablet (md): sidebar stacks below main column
- Mobile (sm): single column, all sections stacked
