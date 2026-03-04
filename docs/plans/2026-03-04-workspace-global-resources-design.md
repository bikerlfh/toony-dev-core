# Design: Global Workspace Resources

**Date:** 2026-03-04
**Status:** Approved
**Approach:** Gradual migration (Approach A)

## Problem

Labels, Teams, and TeamMemberships are currently scoped to Organization via FK. They should be global workspace resources available across all projects and organizations.

## Decisions

| Decision | Choice |
|----------|--------|
| Scope of labels/teams | Workspace global (no org FK) |
| Organization role | Keeps members + permisos (OrganizationMembership unchanged) |
| Project-Team relationship | M2M (optional, multiple teams per project) |
| Permissions for global resources | Authenticated + ADMIN+ in at least one org |
| API prefix | `/api/v1/workspace/` |
| Migration approach | Gradual (new `workspace` app, phased) |

## Model Changes

### Label (move from `projects` to `workspace` app)
- Remove FK `organization`
- Unique constraint: `(name,)` instead of `(organization, name)`

### Team (move from `projects` to `workspace` app)
- Remove FK `organization`
- Unique constraints: `(slug,)` and `(identifier,)` instead of org-scoped
- TeamMembership moves with Team

### Project (stays in `projects` app)
- Remove FK `team` (singular, required)
- Add M2M relationship via `ProjectTeam` join table
- Keep FK `organization`

### New model: ProjectTeam
```python
class ProjectTeam(BaseModel):
    project = ForeignKey(Project, on_delete=CASCADE, related_name="project_teams")
    team = ForeignKey(Team, on_delete=CASCADE, related_name="team_projects")

    constraints = [UniqueConstraint(fields=["project", "team"])]
```

### Unchanged
- OrganizationMembership stays in `accounts`
- Organization stays in `organizations`
- Issue.labels M2M updates to point to `workspace.Label`

## API Changes

### New endpoints: `/api/v1/workspace/`

**Labels:**
- `GET /api/v1/workspace/labels/` — List all global labels
- `POST /api/v1/workspace/labels/` — Create label
- `PUT /api/v1/workspace/labels/{label_id}/` — Update label
- `DELETE /api/v1/workspace/labels/{label_id}/` — Delete label

**Teams:**
- `GET /api/v1/workspace/teams/` — List all global teams
- `POST /api/v1/workspace/teams/` — Create team
- `GET /api/v1/workspace/teams/{team_slug}/` — Team detail
- `PUT /api/v1/workspace/teams/{team_slug}/` — Update team
- `DELETE /api/v1/workspace/teams/{team_slug}/` — Delete team
- `GET /api/v1/workspace/teams/{team_slug}/members/` — Team members
- `POST /api/v1/workspace/teams/{team_slug}/members/` — Add member
- `PUT /api/v1/workspace/teams/{team_slug}/members/{user_id}/` — Change role
- `DELETE /api/v1/workspace/teams/{team_slug}/members/{user_id}/` — Remove member

### New endpoints on projects

- `GET /api/v1/organizations/{org_slug}/projects/{project_slug}/teams/` — Project's teams
- `POST /api/v1/organizations/{org_slug}/projects/{project_slug}/teams/` — Associate team
- `DELETE /api/v1/organizations/{org_slug}/projects/{project_slug}/teams/{team_id}/` — Disassociate team

### Removed endpoints
- `GET/POST /api/v1/organizations/{org_slug}/teams/` (all team endpoints under org)
- `GET/POST /api/v1/organizations/{org_slug}/labels/` (all label endpoints under org)

### New permission class
```python
class IsWorkspaceAdmin(BasePermission):
    """User is authenticated and ADMIN+ in at least one organization."""
```

## Frontend Changes

### New routes
```
(dashboard)/
├── workspace/
│   ├── teams/
│   │   ├── page.tsx
│   │   └── [teamSlug]/page.tsx
│   └── labels/
│       └── page.tsx
├── [orgSlug]/
│   ├── projects/          # unchanged
│   ├── members/           # unchanged (org members)
│   └── settings/          # unchanged
```

### API modules
- New: `frontend/lib/api/workspace.ts` (labels + teams, no orgSlug)
- New: `frontend/lib/api/project-teams.ts` (associate/disassociate teams)
- Remove: `frontend/lib/api/teams.ts`, `frontend/lib/api/labels.ts`

### Sidebar
- "Teams" and "Labels" move to a "Workspace" section above the org switcher
- "Members" and "Settings" stay under the selected org

### Project detail
- Replace single team FK display with "Teams" section (M2M)
- Add/remove teams from project
- `CreateProjectModal` no longer requires `team_slug`

## Data Migration

1. Create `workspace` app with `Label`, `Team`, `TeamMembership`, `ProjectTeam` models
2. Migrate existing data:
   - Copy labels from `projects_label` to `workspace_label` (drop org FK)
   - Copy teams from `projects_team` to `workspace_team` (drop org FK)
   - Copy team memberships
   - Create `ProjectTeam` records from existing `project.team` FK
   - **Deduplication:** Rename conflicting labels/teams with `(org-name)` suffix
3. Update `Issue.labels` M2M to point to `workspace.Label`
4. Remove old FK `team` from `Project`
5. Remove old models from `projects` app
6. Update seed command
