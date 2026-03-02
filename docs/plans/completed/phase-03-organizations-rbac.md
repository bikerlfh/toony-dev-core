# Phase 3: Organizations, Memberships & RBAC

## Context

Phase 2 delivered the custom User model and JWT authentication. Phase 3 builds the multi-tenant foundation: Organization CRUD, OrganizationMembership (join table with roles), RBAC permissions enforced at the view layer, and OrganizationSettings (one-to-one config per org).

**Design doc:** `docs/2026-03-01-toony-dev-core-design.md`

---

## Plan

### A. Organization Model & Membership Model (`accounts` + `organizations`)

1. **Create `backend/organizations/models/organization.py`** — Organization model inheriting from BaseModel: name, slug (unique), description, logo (ImageField), website (URLField), industry, is_active. Table name: `organizations`.
2. **Create `backend/organizations/models/settings.py`** — OrganizationSettings model inheriting from BaseModel: OneToOneField(Organization), default_project_methodology (choices: SCRUM, KANBAN, CUSTOM), timezone (default "UTC"), notification_preferences (JSONField), allowed_ip_ranges (JSONField, nullable), audit_log_retention_days (default 90). Table name: `organization_settings`.
3. **Create `backend/accounts/models/membership.py`** — OrganizationMembership model inheriting from BaseModel: ForeignKey(User), ForeignKey(Organization), role (CharField with choices: OWNER, ADMIN, MANAGER, MEMBER, VIEWER), invited_by (ForeignKey(User), nullable), joined_at (auto_now_add), is_active (default True). Unique constraint on `(user, organization)`. Table name: `organization_memberships`.
4. **Update `backend/organizations/models/__init__.py`** — export Organization, OrganizationSettings.
5. **Update `backend/accounts/models/__init__.py`** — add OrganizationMembership export.
6. **Run `makemigrations` and `migrate`** for both apps.

### B. RBAC Permissions

7. **Create `backend/organizations/permissions.py`** — Custom DRF permission classes:
   - `IsOrganizationMember` — checks the user is an active member of the org identified by `org_slug` in URL kwargs.
   - `IsOrganizationAdmin` — requires OWNER or ADMIN role.
   - `IsOrganizationManager` — requires OWNER, ADMIN, or MANAGER role.
   - `IsOrganizationOwner` — requires OWNER role.
   - Helper function `get_membership(user, org_slug)` to fetch the membership record.

### C. Organization Selectors

8. **Create `backend/organizations/selectors/organization_selector.py`** — functions:
   - `get_organization_by_slug(slug)` — returns Organization or None.
   - `get_organization_by_id(org_id)` — returns Organization or None.
   - `list_user_organizations(user)` — returns QuerySet of organizations the user belongs to (active memberships).
9. **Create `backend/organizations/selectors/membership_selector.py`** — functions:
   - `get_membership(user, organization)` — returns OrganizationMembership or None.
   - `list_organization_members(organization)` — returns QuerySet of active memberships with select_related("user").
   - `get_user_role(user, organization)` — returns role string or None.
10. **Create `backend/organizations/selectors/settings_selector.py`** — functions:
    - `get_organization_settings(organization)` — returns OrganizationSettings or None.
11. **Create `backend/organizations/selectors/__init__.py`** — re-export all selector functions.

### D. Organization Services

12. **Create `backend/organizations/services/organization_service.py`** — functions:
    - `create_organization(name, slug, owner, **kwargs)` — creates Organization, creates OrganizationSettings, creates OrganizationMembership with role=OWNER. Returns organization.
    - `update_organization(organization, **kwargs)` — updates allowed fields. Returns organization.
    - `delete_organization(organization)` — soft-delete (sets is_active=False).
13. **Create `backend/organizations/services/membership_service.py`** — functions:
    - `add_member(organization, user, role, invited_by)` — creates membership. Raises ConflictError if already a member.
    - `update_member_role(membership, new_role)` — updates role. Cannot demote the last OWNER.
    - `remove_member(membership)` — soft-delete (sets is_active=False). Cannot remove the last OWNER.
14. **Create `backend/organizations/services/settings_service.py`** — functions:
    - `update_organization_settings(organization, **kwargs)` — updates OrganizationSettings fields. Returns settings.
15. **Create `backend/organizations/services/__init__.py`** — re-export all service functions.

### E. Serializers

16. **Create `backend/organizations/serializers/input.py`** — serializers:
    - `CreateOrganizationSerializer` — name, slug, description, website, industry (all except slug optional where applicable).
    - `UpdateOrganizationSerializer` — name, description, website, industry (all optional).
    - `AddMemberSerializer` — email, role (with validation for valid role choices).
    - `UpdateMemberRoleSerializer` — role.
    - `UpdateOrganizationSettingsSerializer` — all OrganizationSettings fields (all optional).
17. **Create `backend/organizations/serializers/output.py`** — serializers:
    - `OrganizationListSerializer` — id, name, slug, logo, is_active, created_at.
    - `OrganizationDetailSerializer` — all Organization fields.
    - `MembershipSerializer` — id, user (nested UserDetailSerializer), role, joined_at, is_active.
    - `OrganizationSettingsSerializer` — all OrganizationSettings fields (read-only).
18. **Create `backend/organizations/serializers/__init__.py`** — empty.

### F. Views

19. **Create `backend/organizations/views/organization_views.py`** — views:
    - `OrganizationListCreateView(APIView)` — GET: list user's orgs; POST: create org (user becomes owner).
    - `OrganizationDetailView(APIView)` — GET: org detail; PUT: update org (admin+); DELETE: soft-delete org (owner only).
20. **Create `backend/organizations/views/member_views.py`** — views:
    - `MemberListCreateView(APIView)` — GET: list members (member+); POST: add member (admin+).
    - `MemberDetailView(APIView)` — PUT: update role (admin+); DELETE: remove member (admin+).
21. **Create `backend/organizations/views/settings_views.py`** — views:
    - `OrganizationSettingsView(APIView)` — GET: get settings (member+); PUT: update settings (admin+).
22. **Create `backend/organizations/views/__init__.py`** — re-export all views.

### G. URLs & Routing

23. **Create `backend/organizations/urls.py`** — routes:
    - `""` → OrganizationListCreateView
    - `"<slug:org_slug>/"` → OrganizationDetailView
    - `"<slug:org_slug>/members/"` → MemberListCreateView
    - `"<slug:org_slug>/members/<uuid:user_id>/"` → MemberDetailView
    - `"<slug:org_slug>/settings/"` → OrganizationSettingsView
24. **Update `backend/config/urls.py`** — add `path("api/v1/organizations/", include("organizations.urls"))`.

### H. Admin

25. **Create `backend/organizations/admin.py`** — register Organization, OrganizationSettings, OrganizationMembership with appropriate display fields, filters, and search.

### I. Documentation & Tracking

26. **Save this plan** as `docs/plans/phase-03-organizations-rbac.md`.
27. **Update `docs/plans/implementation-phases.md`** — mark Phase 3 Plan Generated as ✅.

---

## File Manifest

**22 new files, 4 modified files:**

| Section | Files |
|---------|-------|
| A (Models) | `backend/organizations/models/__init__.py`, `backend/organizations/models/organization.py`, `backend/organizations/models/settings.py`, `backend/accounts/models/membership.py`, `backend/accounts/models/__init__.py` (modify) |
| B (Permissions) | `backend/organizations/permissions.py` |
| C (Selectors) | `backend/organizations/selectors/__init__.py`, `backend/organizations/selectors/organization_selector.py`, `backend/organizations/selectors/membership_selector.py`, `backend/organizations/selectors/settings_selector.py` |
| D (Services) | `backend/organizations/services/__init__.py`, `backend/organizations/services/organization_service.py`, `backend/organizations/services/membership_service.py`, `backend/organizations/services/settings_service.py` |
| E (Serializers) | `backend/organizations/serializers/__init__.py`, `backend/organizations/serializers/input.py`, `backend/organizations/serializers/output.py` |
| F (Views) | `backend/organizations/views/__init__.py`, `backend/organizations/views/organization_views.py`, `backend/organizations/views/member_views.py`, `backend/organizations/views/settings_views.py` |
| G (URLs) | `backend/organizations/urls.py`, `backend/config/urls.py` (modify) |
| H (Admin) | `backend/organizations/admin.py` (replace stub) |
| I (Docs) | `docs/plans/phase-03-organizations-rbac.md`, `docs/plans/implementation-phases.md` (modify) |

---

## Verification

1. `docker compose exec backend python manage.py makemigrations` — generates migrations for organizations and accounts apps
2. `docker compose exec backend python manage.py migrate` — applies cleanly
3. `POST /api/v1/organizations/` with auth — creates org, user is auto-assigned OWNER role
4. `GET /api/v1/organizations/` with auth — returns list of user's organizations
5. `GET /api/v1/organizations/{slug}/` — returns org detail for members
6. `PUT /api/v1/organizations/{slug}/` — updates org (admin/owner only)
7. `DELETE /api/v1/organizations/{slug}/` — soft-deletes (owner only)
8. `POST /api/v1/organizations/{slug}/members/` — adds member by email (admin+)
9. `GET /api/v1/organizations/{slug}/members/` — lists members
10. `PUT /api/v1/organizations/{slug}/members/{user_id}/` — updates role
11. `DELETE /api/v1/organizations/{slug}/members/{user_id}/` — removes member
12. `GET /api/v1/organizations/{slug}/settings/` — returns settings
13. `PUT /api/v1/organizations/{slug}/settings/` — updates settings (admin+)
14. Non-members get 403 on all org-scoped endpoints
15. VIEWER role gets 403 on write operations
