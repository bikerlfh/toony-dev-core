# Phase 6: Projects, Milestones & Cycles (Backend)

## Context

Phases 1-5 delivered the backend (Django 5 + DRF, JWT auth, Organization CRUD, Membership RBAC, Teams, Labels) and the frontend foundation. Phase 6 adds the core project management domain models: **Project** (with ProjectMembership and ProjectSettings), **Milestone**, and **Cycle** — all scoped to an organization and linked to teams.

**Design doc:** `docs/2026-03-01-toony-dev-core-design.md`

---

## Plan

### A. Models

1. **`projects/models/project.py`**:
   - **ProjectStatus**: BACKLOG, PLANNED, IN_PROGRESS, PAUSED, COMPLETED, CANCELED
   - **ProjectPriority**: NONE, URGENT, HIGH, MEDIUM, LOW
   - **ProjectMemberRole**: LEAD, CONTRIBUTOR, REVIEWER
   - **EstimationMethod**: STORY_POINTS, T_SHIRT, HOURS
   - **Project**: organization (FK), team (FK→Team), name, slug (unique per org), description, status, priority, lead (FK→User), start_date, target_date, completed_at, sort_order, icon, color
   - **ProjectMembership**: project (FK), user (FK), role, joined_at. Constraint: `unique(project, user)`
   - **ProjectSettings**: project (1:1), repository_url, default_branch, branch_naming_convention, required_reviewers_count, auto_close_completed_issues, issue_prefix_override, estimation_method

2. **`projects/models/milestone.py`**:
   - **MilestoneStatus**: PLANNED, IN_PROGRESS, COMPLETED
   - **Milestone**: project (FK), name, description, target_date, status, sort_order

3. **`projects/models/cycle.py`**:
   - **CycleStatus**: PLANNED, ACTIVE, COMPLETED
   - **Cycle**: project (FK), name, number (auto-incremented per project), start_date, end_date, status. Constraint: `unique(project, number)`

4. Migration: `projects/migrations/0002_project_milestone_cycle_projectmembership_and_more.py`

### B. Selectors

5. **`project_selector.py`** — `list_organization_projects()`, `get_project_by_slug()`, `list_project_members()`, `get_project_membership()`, `get_project_settings()`
6. **`milestone_selector.py`** — `list_project_milestones()`, `get_milestone_by_id()`
7. **`cycle_selector.py`** — `list_project_cycles()`, `get_cycle_by_id()`, `get_next_cycle_number()`

### C. Services

8. **`project_service.py`** — `create_project()` (atomic: creates project + settings + lead membership), `update_project()`, `delete_project()`, `add_project_member()`, `update_project_member_role()`, `remove_project_member()`, `update_project_settings()`
9. **`milestone_service.py`** — `create_milestone()`, `update_milestone()`, `delete_milestone()`
10. **`cycle_service.py`** — `create_cycle()` (auto-assigns next number), `update_cycle()`, `delete_cycle()`

### D. Serializers

11. **Input**: `CreateProjectSerializer`, `UpdateProjectSerializer`, `AddProjectMemberSerializer`, `UpdateProjectMemberRoleSerializer`, `UpdateProjectSettingsSerializer`, `CreateMilestoneSerializer`, `UpdateMilestoneSerializer`, `CreateCycleSerializer`, `UpdateCycleSerializer`
12. **Output**: `ProjectListSerializer`, `ProjectDetailSerializer`, `ProjectMembershipSerializer`, `ProjectSettingsSerializer`, `MilestoneSerializer`, `CycleSerializer`

### E. Permissions

13. **`IsProjectAccessible`** — resolves org membership + project from URL, stores on `request`

### F. Views

14. **`project_views.py`** — `ProjectListCreateView`, `ProjectDetailView`, `ProjectMemberListCreateView`, `ProjectMemberDetailView`, `ProjectSettingsView`
15. **`milestone_views.py`** — `MilestoneListCreateView`, `MilestoneDetailView`
16. **`cycle_views.py`** — `CycleListCreateView`, `CycleDetailView`

### G. URLs, Admin

17. Extended `projects/urls.py` with project, milestone, cycle routes
18. Extended `projects/admin.py` with Project, ProjectMembership, ProjectSettings, Milestone, Cycle

---

## API Endpoints

All under `/api/v1/organizations/{org_slug}/`:

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `projects/` | Member | List projects |
| POST | `projects/` | Manager+ | Create project |
| GET | `projects/{slug}/` | Member (via IsProjectAccessible) | Get project |
| PUT | `projects/{slug}/` | Member (via IsProjectAccessible) | Update project |
| DELETE | `projects/{slug}/` | Member (via IsProjectAccessible) | Delete project |
| GET | `projects/{slug}/members/` | Member (via IsProjectAccessible) | List project members |
| POST | `projects/{slug}/members/` | Member (via IsProjectAccessible) | Add project member |
| PUT | `projects/{slug}/members/{user_id}/` | Member (via IsProjectAccessible) | Update member role |
| DELETE | `projects/{slug}/members/{user_id}/` | Member (via IsProjectAccessible) | Remove member |
| GET | `projects/{slug}/settings/` | Member (via IsProjectAccessible) | Get project settings |
| PUT | `projects/{slug}/settings/` | Member (via IsProjectAccessible) | Update settings |
| GET | `projects/{slug}/milestones/` | Member (via IsProjectAccessible) | List milestones |
| POST | `projects/{slug}/milestones/` | Member (via IsProjectAccessible) | Create milestone |
| GET | `projects/{slug}/milestones/{id}/` | Member (via IsProjectAccessible) | Get milestone |
| PUT | `projects/{slug}/milestones/{id}/` | Member (via IsProjectAccessible) | Update milestone |
| DELETE | `projects/{slug}/milestones/{id}/` | Member (via IsProjectAccessible) | Delete milestone |
| GET | `projects/{slug}/cycles/` | Member (via IsProjectAccessible) | List cycles |
| POST | `projects/{slug}/cycles/` | Member (via IsProjectAccessible) | Create cycle |
| GET | `projects/{slug}/cycles/{id}/` | Member (via IsProjectAccessible) | Get cycle |
| PUT | `projects/{slug}/cycles/{id}/` | Member (via IsProjectAccessible) | Update cycle |
| DELETE | `projects/{slug}/cycles/{id}/` | Member (via IsProjectAccessible) | Delete cycle |

---

## File Manifest

**10 new files, 6 modified files:**

| Section | Files |
|---------|-------|
| A (Models) | `projects/models/project.py` (new), `projects/models/milestone.py` (new), `projects/models/cycle.py` (new), `projects/models/__init__.py` (modify), `projects/migrations/0002_*.py` (new) |
| B (Selectors) | `projects/selectors/project_selector.py` (new), `projects/selectors/milestone_selector.py` (new), `projects/selectors/cycle_selector.py` (new), `projects/selectors/__init__.py` (modify) |
| C (Services) | `projects/services/project_service.py` (new), `projects/services/milestone_service.py` (new), `projects/services/cycle_service.py` (new), `projects/services/__init__.py` (modify) |
| D (Serializers) | `projects/serializers/input.py` (modify), `projects/serializers/output.py` (modify) |
| E (Permissions) | `projects/permissions.py` (modify) |
| F (Views) | `projects/views/project_views.py` (new), `projects/views/milestone_views.py` (new), `projects/views/cycle_views.py` (new), `projects/views/__init__.py` (modify) |
| G (URLs/Admin) | `projects/urls.py` (modify), `projects/admin.py` (modify) |

---

## Key Decisions

1. **Project creation is atomic** — creates Project + ProjectSettings + LEAD membership in one transaction.
2. **Cycle number auto-incremented** — `get_next_cycle_number()` finds max and increments, with unique constraint safety.
3. **ProjectSettings simplified** — deferred `repository_credential` FK and `environment_variables` encrypted field to Phase 10 (Credentials & Integration Config).
4. **Hard delete for projects/milestones/cycles** — unlike teams (soft-delete), these are harder-deleted since they are less likely to be referenced across boundaries.
5. **Manager+ required for project creation** — matches RBAC spec; project detail/member/settings operations require IsProjectAccessible (any org member who can see the project).
