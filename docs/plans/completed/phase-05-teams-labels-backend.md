# Phase 5: Teams & Labels (Backend)

## Context

Phases 1-4 delivered the full backend (Django 5 + DRF, JWT auth, Organization CRUD, Membership RBAC) and the frontend foundation (auth pages, sidebar shell, member management). Phase 5 adds the first domain models in the `projects` app: **Team**, **TeamMembership**, and **Label** — all scoped to an organization.

**Design doc:** `docs/2026-03-01-toony-dev-core-design.md`

---

## Plan

### A. Models

1. **`projects/models/team.py`** — Team + TeamMembership + TeamRole enum:
   - **Team**: organization (FK), name, slug (unique per org), description, identifier (unique per org, e.g. "ENG"), is_active
   - **TeamMembership**: team (FK), user (FK), role (LEAD/MEMBER), joined_at
   - Constraints: `unique(organization, slug)`, `unique(organization, identifier)`, `unique(team, user)`
   - **TeamRole**: `LEAD`, `MEMBER`

2. **`projects/models/label.py`** — Label:
   - organization (FK), name (unique per org), color (hex), description
   - Constraint: `unique(organization, name)`

3. **`projects/models/__init__.py`** — barrel re-export
4. **Migration** — `projects/migrations/0001_initial.py`

### B. Selectors

5. **`projects/selectors/team_selector.py`** — `list_organization_teams()`, `get_team_by_slug()`, `list_team_members()`, `get_team_membership()`
6. **`projects/selectors/label_selector.py`** — `list_organization_labels()`, `get_label_by_id()`
7. **`projects/selectors/__init__.py`** — barrel re-export

### C. Services

8. **`projects/services/team_service.py`** — `create_team()` (with atomic transaction, auto-adds creator as LEAD), `update_team()`, `delete_team()` (soft-delete), `add_team_member()`, `update_team_member_role()`, `remove_team_member()` (hard delete)
9. **`projects/services/label_service.py`** — `create_label()`, `update_label()`, `delete_label()` (hard delete)
10. **`projects/services/__init__.py`** — barrel re-export

### D. Serializers

11. **`projects/serializers/input.py`** — `CreateTeamSerializer`, `UpdateTeamSerializer`, `AddTeamMemberSerializer`, `UpdateTeamMemberRoleSerializer`, `CreateLabelSerializer`, `UpdateLabelSerializer`
12. **`projects/serializers/output.py`** — `TeamListSerializer`, `TeamDetailSerializer`, `TeamMembershipSerializer`, `LabelSerializer`

### E. Permissions

13. **`projects/permissions.py`** — `IsTeamAccessible` (resolves org membership + team from URL, stores on request)

### F. Views

14. **`projects/views/team_views.py`** — `TeamListCreateView`, `TeamDetailView`, `TeamMemberListCreateView`, `TeamMemberDetailView`
15. **`projects/views/label_views.py`** — `LabelListCreateView`, `LabelDetailView`
16. **`projects/views/__init__.py`** — barrel re-export

### G. URLs & Wiring

17. **`projects/urls.py`** — Team and label URL patterns
18. **`config/urls.py`** — Wire `projects.urls` under `organizations/<org_slug>/`

### H. Admin

19. **`projects/admin.py`** — Admin classes for Team, TeamMembership, Label

---

## API Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/organizations/{org_slug}/teams/` | Member | List teams |
| POST | `/organizations/{org_slug}/teams/` | Admin | Create team |
| GET | `/organizations/{org_slug}/teams/{team_slug}/` | Member (via IsTeamAccessible) | Get team |
| PUT | `/organizations/{org_slug}/teams/{team_slug}/` | Member (via IsTeamAccessible) | Update team |
| DELETE | `/organizations/{org_slug}/teams/{team_slug}/` | Member (via IsTeamAccessible) | Soft-delete team |
| GET | `/organizations/{org_slug}/teams/{team_slug}/members/` | Member (via IsTeamAccessible) | List team members |
| POST | `/organizations/{org_slug}/teams/{team_slug}/members/` | Member (via IsTeamAccessible) | Add team member |
| PUT | `/organizations/{org_slug}/teams/{team_slug}/members/{user_id}/` | Member (via IsTeamAccessible) | Update member role |
| DELETE | `/organizations/{org_slug}/teams/{team_slug}/members/{user_id}/` | Member (via IsTeamAccessible) | Remove member |
| GET | `/organizations/{org_slug}/labels/` | Member | List labels |
| POST | `/organizations/{org_slug}/labels/` | Admin | Create label |
| GET | `/organizations/{org_slug}/labels/{label_id}/` | Member | Get label |
| PUT | `/organizations/{org_slug}/labels/{label_id}/` | Admin | Update label |
| DELETE | `/organizations/{org_slug}/labels/{label_id}/` | Admin | Delete label |

---

## File Manifest

**16 new files, 1 modified file:**

| Section | Files |
|---------|-------|
| A (Models) | `projects/models/__init__.py`, `projects/models/team.py`, `projects/models/label.py`, `projects/migrations/0001_initial.py` |
| B (Selectors) | `projects/selectors/__init__.py`, `projects/selectors/team_selector.py`, `projects/selectors/label_selector.py` |
| C (Services) | `projects/services/__init__.py`, `projects/services/team_service.py`, `projects/services/label_service.py` |
| D (Serializers) | `projects/serializers/__init__.py`, `projects/serializers/input.py`, `projects/serializers/output.py` |
| E (Permissions) | `projects/permissions.py` |
| F (Views) | `projects/views/__init__.py`, `projects/views/team_views.py`, `projects/views/label_views.py` |
| G (URLs) | `projects/urls.py`, `config/urls.py` (modify) |
| H (Admin) | `projects/admin.py` |

---

## Key Decisions

1. **Teams & Labels in `projects` app** — matches the design doc's file structure; these are domain models scoped to organizations.
2. **TeamRole is separate from MembershipRole** — team-level roles (LEAD/MEMBER) are distinct from org-level roles (OWNER/ADMIN/MANAGER/MEMBER/VIEWER).
3. **Soft-delete for teams, hard-delete for labels/team-memberships** — teams may be referenced by future projects/issues; labels are simpler to remove.
4. **IsTeamAccessible permission** — combines org membership check + team resolution in one pass, storing both on `request`.
5. **Team creation auto-adds creator as LEAD** — ensures every team always has at least one lead.
