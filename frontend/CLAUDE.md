# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository's frontend.

## Commands

```bash
# Via Makefile from repo root
make lint-frontend          # next lint (inside container)

# Build (inside container or locally)
./node_modules/.bin/next build    # avoid npx picking wrong version

# Dev server runs automatically via Docker (port 3000)
make up                     # or: make up-frontend
make logs-frontend
```

No test framework is installed yet (no Jest, Vitest, or Testing Library).

## Architecture

Next.js 15 App Router. All pages are `"use client"` — no server components. Data fetching is client-side via `useEffect` + Axios.

### Route Structure

```
app/
  (auth)/           — Login, Register (centered card layout)
  (dashboard)/      — Sidebar wrapper (flat routes, no org-scoping)
    page.tsx                        — Dashboard home (redirects to /projects)
    organizations/                  — Org list, [id] detail (6 tabs), new
    projects/                       — Project list, [id] detail (issues, milestones, cycles, members, settings), new
    projects/[id]/issues/[issueId]/ — Issue detail
    teams/                          — Teams list, [id] detail
    labels/                         — Labels CRUD
    subagents/                      — Sub-Agents list, [id]/edit, new
    skills/                         — Skills list, [id]/edit, new
    toony-agents/                   — Toony Agents list, [id] detail, [id]/tasks/[taskId]
```

### Key Infrastructure

- **`lib/api.ts`** — Axios instance, `baseURL` from `NEXT_PUBLIC_API_URL` (default `/api`). Request interceptor adds `Authorization: Bearer`. Response interceptor handles 401 with silent refresh + request queue.
- **`lib/auth.ts`** — `setTokens()`/`clearTokens()` manage localStorage (`toony_access_token`, `toony_refresh_token`) + cookie signal (`toony_authenticated`).
- **`lib/roles.ts`** — OWNER(0) > ADMIN(1) > MANAGER(2) > MEMBER(3) > VIEWER(4). Helpers: `canManageMembers` (ADMIN+), `canEditOrg` (ADMIN+), `canDeleteOrg` (OWNER), `canManageTeams` (ADMIN+), `canCreateProject` (MANAGER+), `canManageLabels` (ADMIN+).
- **`lib/api/`** — Domain API modules (auth, organizations, members, settings, teams, projects, milestones, cycles, labels, issues, sub-agents, skills, sub-agent-skills, credentials, integrations, imports, search). All re-exported from `lib/api/index.ts`. All use UUIDs, no slugs.
- **`contexts/auth-context.tsx`** — AuthProvider at root layout. Hydrates user from token on mount.
- **`middleware.ts`** — Reads `toony_authenticated` cookie. Redirects unauthenticated users to `/login?redirect=<path>`. Redirects authenticated users away from auth pages.

### Patterns

**Data fetching:**
```tsx
const fetchData = useCallback(async () => {
  try { setData((await listThings()).results); }
  finally { setIsLoading(false); }
}, []);
useEffect(() => { fetchData(); }, [fetchData]);
```

**Modals:** `fixed inset-0 z-50 bg-black/50` backdrop, `max-w-sm/md rounded-lg bg-white p-6 shadow-xl` content.

**Role gating:** Check user roles for conditional rendering.

**API errors in modals:** `Object.values(err.response.data).flat().join(" ")`.

**Form validation:** Add `submitted` class to form on submit, CSS highlights invalid fields via `form.submitted input:invalid`.

**`useSearchParams()`** requires `<Suspense>` boundary (Next.js 15).

**`updateProject` uses PUT**, `updateOrganization` uses PATCH — be aware of this inconsistency.

**Issues use UUIDs** as URL params (previously used `identifier` like "PROJ-1").

### WebSocket Hooks

- **`hooks/use-websocket.ts`** — Core hook. Exponential backoff reconnect (1s × 2^retries, cap 30s, max 10 retries). Auth close codes 4001/4003 stop reconnect.
- **`hooks/use-project-websocket.ts`** — `ws/projects/{id}/?token=`. Handles issue + comment CRUD events.
- **`hooks/use-agent-websocket.ts`** — `ws/subagents/{id}/?token=`. Handles task + heartbeat events. Send helpers: `sendTaskResult`, `sendStatusUpdate`, `sendHeartbeat`. Hook: `useSubAgentWebSocket`.

### Tech Stack

- **React 19**, **Next.js 15** (App Router, standalone output)
- **Tailwind CSS v4** — `@import "tailwindcss"` in globals.css, no config file
- **TypeScript 5.9** — strict mode, `@/*` path alias
- **Axios** — sole HTTP client

### Environment Variables

- `NEXT_PUBLIC_API_URL` — default `http://localhost:8000/api`
- `NEXT_PUBLIC_WS_URL` — default `ws://localhost:8000`

## Field Map

### Types (in `types/`)

**auth.ts:**
- `User` — `id`, `email`, `first_name`, `last_name`, `avatar`, `created_at`, `updated_at`
- `AuthTokens` — `access`, `refresh`
- `AuthResponse` — `user` + `tokens`
- `LoginCredentials` — `email`, `password`
- `RegisterCredentials` — `email`, `password`, `first_name`, `last_name`

**organization.ts:**
- `Organization` — `id`, `name`, `slug`, `description`, `website`, `industry`, `logo`, `is_active`, `created_at`
- `OrganizationDetail` — extends Organization + `member_count`
- `MembershipRole` — `"OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER"`
- `Member` — `id`, `user` (User), `role`, `joined_at`, `is_active`
- `OrganizationSettings` — `default_project_methodology`, `timezone`, `notification_preferences`, `allowed_ip_ranges`, `audit_log_retention_days`

**projects.ts:**
- `Team` — `id`, `name`, `slug`, `description`, `identifier`, `is_active`, `organization`, `created_at`
- `TeamDetail` — extends Team + `member_count`
- `TeamMember` — `id`, `user`, `role` (LEAD|MEMBER), `joined_at`
- `Label` — `id`, `name`, `color`, `description`, `organization`, `created_at`
- `ProjectList` / `ProjectDetail` — `id`, `name`, `slug`, `description`, `status` (ProjectStatus), `priority` (ProjectPriority), `team`, `lead`, `start_date`, `target_date`, `completed_at`, `member_count`, `issue_count`, `icon`, `color`
- `ProjectMember` — `id`, `user`, `role` (LEAD|CONTRIBUTOR|REVIEWER), `joined_at`
- `ProjectSettings` — `repository_url`, `repository_credential`, `default_branch`, `branch_naming_convention`, `required_reviewers_count`, `auto_close_completed_issues`, `issue_prefix_override`, `estimation_method`
- `Milestone` — `id`, `name`, `description`, `target_date`, `status` (MilestoneStatus), `sort_order`, `project`
- `Cycle` — `id`, `name`, `number`, `start_date`, `end_date`, `status` (CycleStatus), `project`
- `IssueList` / `IssueDetail` — `id`, `identifier`, `title`, `description`, `status`, `priority`, `assignee`, `reporter`, `labels`, `milestone`, `cycle`, `parent`, `estimate`, `due_date`, `sort_order`, `sub_issue_count`, `comment_count`
- `IssueComment` — `id`, `body`, `author`, `edited_at`, `created_at`
- `IssueActivity` — `id`, `action`, `field_changed`, `old_value`, `new_value`, `user`, `created_at`

**agents.ts:**
- `SubAgentList` / `SubAgentDetail` — `id`, `name`, `slug`, `description`, `version`, `status`, `agent_type`, `capabilities`, `max_concurrent_tasks`, `tags`, `created_by`, `assigned_projects`, `skill_count`
- `SkillList` / `SkillDetail` — `id`, `name`, `slug`, `description`, `version`, `content`, `status`, `category`, `input_schema`, `output_schema`, `compatible_agent_types`, `tags`, `created_by`, `agent_count`
- `SubAgentSkill` — `id`, `sub_agent`, `skill`, `priority`, `is_enabled`, `custom_config`
- `SkillVersion` — `id`, `version`, `content`, `changelog`, `created_by`, `created_at`

**credentials.ts:**
- `RepositoryCredential` — `id`, `name`, `provider`, `credential_type`, `url_pattern`, `is_active`, `organization`, `created_at`
- `IntegrationConfig` — `id`, `provider`, `webhook_url`, `is_active`, `organization`, `created_at`

**imports.ts:**
- `ImportJob` / `ImportJobDetail` — `id`, `provider`, `status`, `config`, `progress`, `total_items`, `imported_items`, `error_log`, `target_project`, `started_by`, `started_at`, `completed_at`
- `ImportMapping` — `id`, `external_id`, `external_type`, `internal_id`, `internal_type`
- `ExternalProject` — `id`, `name`, `description`, `url`

**websocket.ts:**
- `ProjectWsEvent` — union of `issue.created`, `issue.updated`, `issue.deleted`, `comment.created`, `comment.updated`, `comment.deleted`
- `SubAgentWsEvent` — union of `task.assign`, `heartbeat.ack`

**index.ts:**
- `PaginatedResponse<T>` — `{ next, previous, results }`
- `GlobalSearchResult` — `{ issues, projects, teams, labels }`
