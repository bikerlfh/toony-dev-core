# Remove Organization Scope — Design Document

## Summary

Remove organization as the primary navigation scope. Users see all resources across all their organizations without selecting one first. The frontend drops `[orgSlug]` from routes, the backend drops `/v1/` and switches all URL identifiers from slugs to UUIDs.

## Decisions

- **Migration approach:** Big-bang (frontend + backend together)
- **URL identifiers:** All UUIDs, no slugs in any URL
- **Frontend routing:** Flat paths (`/projects`, `/organizations`, `/teams`, etc.)
- **Project list:** Cross-org, returns projects from all user's organizations
- **Org-specific resources:** Members, settings, credentials, integrations, imports stay under `/api/organizations/{id}/`
- **Global resources:** Projects, teams, labels, subagents, skills, toony-agents, search — no org in URL

## Backend — New URL Structure

### Base URL

`/api/v1/` → `/api/`

### Global URLs (no org scope)

| Resource | URL |
|---|---|
| Auth | `/api/auth/{register,login,refresh,me}/` |
| Health | `/api/health/` |
| Organizations | `/api/organizations/`, `/api/organizations/{id}/` |
| Projects | `/api/projects/`, `/api/projects/{id}/` |
| Teams | `/api/workspace/teams/`, `/api/workspace/teams/{id}/` |
| Team members | `/api/workspace/teams/{id}/members/`, `.../{user_id}/` |
| Labels | `/api/workspace/labels/`, `/api/workspace/labels/{id}/` |
| SubAgents | `/api/subagents/`, `/api/subagents/{id}/` |
| SubAgent skills | `/api/subagents/{id}/skills/`, `.../{skill_id}/` |
| Skills | `/api/skills/`, `/api/skills/{id}/` |
| Skill versions | `/api/skills/{id}/versions/` |
| Toony Agents | `/api/toony-agents/`, `/api/toony-agents/{id}/` |
| Toony Agent keys | `/api/toony-agents/{id}/keys/`, `.../{key_id}/` |
| Toony Agent tasks | `/api/toony-agents/{id}/tasks/`, `.../{task_id}/` |
| Task events | `/api/toony-agents/{id}/tasks/{task_id}/events/` |
| Task cancel | `/api/toony-agents/{id}/tasks/{task_id}/cancel/` |
| Search | `/api/search/?q=...` |

### Org-Scoped URLs (under org UUID)

| Resource | URL |
|---|---|
| Members | `/api/organizations/{id}/members/`, `.../{user_id}/` |
| Settings | `/api/organizations/{id}/settings/` |
| Credentials | `/api/organizations/{id}/credentials/`, `.../{credential_id}/` |
| Integrations | `/api/organizations/{id}/integrations/`, `.../{integration_id}/` |
| Imports | `/api/organizations/{id}/imports/`, `.../{job_id}/` |
| Import mappings | `/api/organizations/{id}/imports/{job_id}/mappings/` |
| External projects | `/api/organizations/{id}/imports/external-projects/` |

### Project Sub-Resources (under project UUID)

| Resource | URL |
|---|---|
| Members | `/api/projects/{id}/members/`, `.../{user_id}/` |
| Settings | `/api/projects/{id}/settings/` |
| Teams | `/api/projects/{id}/teams/`, `.../{team_id}/` |
| Resources | `/api/projects/{id}/resources/`, `.../{resource_id}/` |
| Milestones | `/api/projects/{id}/milestones/`, `.../{milestone_id}/` |
| Cycles | `/api/projects/{id}/cycles/`, `.../{cycle_id}/` |
| Issues | `/api/projects/{id}/issues/`, `.../{id}/` |
| Comments | `/api/projects/{id}/issues/{id}/comments/`, `.../{comment_id}/` |
| Activities | `/api/projects/{id}/issues/{id}/activities/` |

### Permission Changes

- `IsProjectAccessible`: looks up project by UUID → gets `project.organization` → validates user membership in that org. No `org_slug` needed from URL.
- `IsOrganizationMember/Admin/Owner`: looks up org by UUID instead of slug.
- `GET /api/projects/` returns projects from all orgs where user has membership. Output serializer includes `organization` object (id, name, slug).

## Frontend — New Structure

### Route Structure

```
app/
  (auth)/
    login/page.tsx
    register/page.tsx

  (dashboard)/
    layout.tsx              ← Sidebar + main (no OrgProvider wrapping)
    page.tsx                ← Dashboard home

    organizations/
      page.tsx              ← Org list (cards) + create button
      new/page.tsx          ← Create org form (full page)
      [id]/page.tsx         ← Org detail (tabs: General, Members, Settings, Credentials, Integrations, Imports)

    projects/
      page.tsx              ← All projects (cards: name, org, status, priority, lead, target)
      new/page.tsx          ← Create project form (full page, org selector)
      [id]/page.tsx         ← Project detail (tabs: Issues, Milestones, Cycles, Members, Settings, Resources)
        issues/
          [id]/page.tsx     ← Issue detail

    teams/
      page.tsx
      [id]/page.tsx

    labels/page.tsx

    subagents/
      page.tsx
      new/page.tsx
      [id]/edit/page.tsx

    skills/
      page.tsx
      new/page.tsx
      [id]/edit/page.tsx

    toony-agents/
      page.tsx
      [id]/page.tsx
      [id]/tasks/[taskId]/page.tsx
```

### Sidebar

Remove `<OrgSwitcher>`. New menu:

| Item | Route |
|---|---|
| Dashboard | `/` |
| Organizations | `/organizations` |
| Projects | `/projects` |
| Teams | `/teams` |
| Labels | `/labels` |
| **AI Studio** (group) | |
| → Sub-Agents | `/subagents` |
| → Skills | `/skills` |
| → Toony Agents | `/toony-agents` |

Removed from menu: Settings, Credentials, Imports (moved to org detail tabs).

### OrgContext

Eliminated. No global "current org". Org info fetched per-page when needed (e.g., org detail page fetches by ID).

### Projects Page

- Cards grid (responsive) showing: name, organization (badge), status (colored badge), priority (icon), lead (avatar), target date
- Filter by organization, status, priority
- Click card → `/projects/{id}`

### Create Project Page (`/projects/new`)

- Full page form (not modal)
- Organization selector (dropdown of user's orgs) — required
- Fields: name, slug, description, short_summary, status, priority, start_date, target_date
- `POST /api/projects/` with `organization_id` in body
- On success → redirect to `/projects/{id}`

### Organization Detail (`/organizations/{id}`)

Tabs consolidating all org config:

| Tab | Content |
|---|---|
| General | Org info: name, slug, description, website, industry (inline edit) |
| Members | Member list, invite, change role, remove |
| Settings | Org settings form |
| Credentials | Credentials management |
| Integrations | Integration management |
| Imports | Import wizard + history |

### API Service Changes (Frontend)

| Module | Change |
|---|---|
| `api.ts` (base) | `baseURL`: `/api/v1` → `/api` |
| `organizations.ts` | `{slug}` → `{id}` |
| `members.ts` | `{orgSlug}` → `{orgId}` |
| `settings.ts` | `{orgSlug}` → `{orgId}` |
| `credentials.ts` | `{orgSlug}` → `{orgId}` |
| `integrations.ts` | `{orgSlug}` → `{orgId}` |
| `imports.ts` | `{orgSlug}` → `{orgId}` |
| `projects.ts` | Remove `orgSlug`. List: `GET /projects/`. Detail: `/projects/{id}/`. Create: `organization_id` in body. |
| `milestones.ts` | Remove `orgSlug`. Routes: `/projects/{projectId}/milestones/...` |
| `cycles.ts` | Same as milestones |
| `issues.ts` | Remove `orgSlug`. Issues by UUID: `/projects/{projectId}/issues/{id}/` |
| `project-teams.ts` | Remove `orgSlug` |
| `resources.ts` | Remove `orgSlug` |
| `workspace.ts` | Team detail by UUID: `/workspace/teams/{id}/` |
| `toony-agents.ts` | Remove `orgSlug`. Routes: `/toony-agents/{id}/...` |
| `search.ts` | Remove `orgSlug`. Route: `/search/?q=...` |
| `sub-agents.ts` | No changes (already global) |
| `skills.ts` | No changes |
