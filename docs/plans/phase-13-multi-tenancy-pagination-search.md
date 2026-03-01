# Phase 13: Multi-Tenancy Hardening, Pagination & Search

## Context

Phases 1–12 built the complete feature set: auth, orgs, teams, projects, issues, credentials, agents, and imports. All selectors already filter by organization FK, and permissions enforce org membership via URL params. Phase 13 **hardens** this isolation with DB indexes, adds **cursor pagination** to all list endpoints, and introduces **full-text search** with a global search endpoint + command-palette UI.

---

## Plan

### A. Backend — Custom Cursor Pagination

**New:** `backend/common/pagination.py`
- `CursorPaginator` class extending `rest_framework.pagination.CursorPagination`
- `page_size = 50`, `ordering = "-created_at"`, `cursor_query_param = "cursor"`
- Response shape: `{ next, previous, results }`

**Modify:** `backend/config/settings/base.py`
- Change `DEFAULT_PAGINATION_CLASS` to `common.pagination.CursorPaginator`

### B. Backend — Paginate All List Views

Add `paginate_queryset()` / `get_paginated_response()` pattern to every list endpoint. This requires a small mixin since raw `APIView` doesn't have pagination built-in.

**New:** `backend/common/mixins.py`
- `PaginatedViewMixin` — provides `paginate(queryset, serializer_class)` helper that uses `CursorPaginator`

**Modify (add pagination to GET list):**
- `backend/organizations/views/organization_views.py` — OrganizationListCreateView
- `backend/organizations/views/member_views.py` — MemberListCreateView
- `backend/organizations/views/credential_views.py` — CredentialListCreateView
- `backend/organizations/views/integration_views.py` — IntegrationListCreateView
- `backend/projects/views/team_views.py` — TeamListCreateView, TeamMemberListCreateView
- `backend/projects/views/project_views.py` — ProjectListCreateView, ProjectMemberListCreateView
- `backend/projects/views/label_views.py` — LabelListCreateView
- `backend/projects/views/milestone_views.py` — MilestoneListCreateView
- `backend/projects/views/cycle_views.py` — CycleListCreateView
- `backend/projects/views/issue_views.py` — IssueListCreateView, IssueCommentListCreateView, IssueActivityListView
- `backend/agents/views/agent_views.py` — AgentListCreateView
- `backend/agents/views/skill_views.py` — SkillListCreateView, SkillVersionListView
- `backend/agents/views/agent_skill_views.py` — AgentSkillListView
- `backend/importers/views/import_views.py` — ImportJobListCreateView, ImportJobMappingsView

### C. Backend — Database Indexes for Multi-Tenancy

**Modify:** `backend/projects/models/team.py` — add `indexes = [models.Index(fields=["organization", "name"])]` to Meta
**Modify:** `backend/projects/models/label.py` — add `indexes = [models.Index(fields=["organization", "name"])]`
**Modify:** `backend/projects/models/project.py` — add `indexes = [models.Index(fields=["organization", "slug"])]`
**Modify:** `backend/projects/models/issue.py` — add `indexes = [models.Index(fields=["project", "status"]), models.Index(fields=["project", "created_at"])]`
**Modify:** `backend/agents/models/agent.py` — add `indexes = [models.Index(fields=["organization", "slug"])]`
**Modify:** `backend/agents/models/skill.py` — add `indexes = [models.Index(fields=["organization", "slug"])]`
**Modify:** `backend/importers/models/import_job.py` — add `indexes = [models.Index(fields=["organization", "created_at"])]`
**Modify:** `backend/organizations/models/credential.py` — add `indexes = [models.Index(fields=["organization", "name"])]`
**Modify:** `backend/organizations/models/integration.py` — add `indexes = [models.Index(fields=["organization", "provider"])]`

**Generate:** migrations for all index additions

### D. Backend — Full-Text Search Selectors

**Modify:** `backend/projects/selectors/issue_selector.py`
- Add `search` param to `list_project_issues()` — uses Django `SearchVector`/`SearchQuery` on title + description

**Modify:** `backend/projects/selectors/project_selector.py`
- Add `search` param to `list_organization_projects()` — search name + description

**Modify:** `backend/projects/selectors/team_selector.py`
- Add `search` param to `list_organization_teams()` — search name + description

**Modify:** `backend/projects/selectors/label_selector.py`
- Add `search` param to `list_organization_labels()` — search name

**Modify:** corresponding views to pass `?q=` query param to selectors

### E. Backend — Global Search Endpoint

**New:** `backend/organizations/selectors/search_selector.py`
- `global_search(organization, query, limit=5)` — searches across issues, projects, teams, labels; returns dict of limited results

**New:** `backend/organizations/serializers/output.py` — add `GlobalSearchResultSerializer`

**New:** `backend/organizations/views/search_views.py`
- `GlobalSearchView(APIView)`: GET with `?q=` param, returns `{ issues, projects, teams, labels }`
- Permission: `IsOrganizationMember`

**Modify:** `backend/organizations/urls.py` — add `<slug:org_slug>/search/` → GlobalSearchView
**Modify:** `backend/organizations/views/__init__.py` — export GlobalSearchView

### F. Frontend — Pagination Types & API

**Modify:** `frontend/types/index.ts` — add generic `PaginatedResponse<T>` type

**Modify all list API functions** to accept optional `cursor` param and return `PaginatedResponse<T>`:
- `frontend/lib/api/issues.ts` — listIssues, listComments, listActivities
- `frontend/lib/api/teams.ts` — listTeams, listTeamMembers
- `frontend/lib/api/projects.ts` — listProjects, listProjectMembers
- `frontend/lib/api/labels.ts` — listLabels
- `frontend/lib/api/milestones.ts` — listMilestones
- `frontend/lib/api/cycles.ts` — listCycles
- `frontend/lib/api/agents.ts` — listAgents
- `frontend/lib/api/skills.ts` — listSkills, listSkillVersions
- `frontend/lib/api/agent-skills.ts` — listAgentSkills
- `frontend/lib/api/credentials.ts` — listCredentials
- `frontend/lib/api/integrations.ts` — listIntegrations
- `frontend/lib/api/imports.ts` — listImportJobs
- `frontend/lib/api/members.ts` — listMembers
- `frontend/lib/api/organizations.ts` — listOrganizations

### G. Frontend — Search API & Types

**New:** `frontend/lib/api/search.ts` — `globalSearch(orgSlug, query)` function

**Modify:** `frontend/types/index.ts` — add `GlobalSearchResult` type
**Modify:** `frontend/lib/api/index.ts` — re-export search function

### H. Frontend — Global Search UI (Command Palette)

**New:** `frontend/components/search-command-palette.tsx`
- Triggered by Cmd+K / Ctrl+K keyboard shortcut
- Modal overlay with search input
- Debounced query (300ms)
- Categorized results: Issues, Projects, Teams, Labels
- Click result navigates to detail page
- Escape closes

**Modify:** `frontend/components/sidebar.tsx` — add search button/shortcut hint above nav

**New:** `frontend/hooks/use-debounce.ts` — generic debounce hook

### I. Frontend — Load More on List Pages

Update list pages to handle paginated responses with "Load more" button:
- `frontend/app/(dashboard)/[orgSlug]/teams/page.tsx`
- `frontend/app/(dashboard)/[orgSlug]/projects/page.tsx`
- `frontend/app/(dashboard)/[orgSlug]/labels/page.tsx`
- `frontend/app/(dashboard)/[orgSlug]/members/page.tsx`
- `frontend/app/(dashboard)/[orgSlug]/agents/page.tsx`
- `frontend/app/(dashboard)/[orgSlug]/credentials/page.tsx`
- `frontend/app/(dashboard)/[orgSlug]/imports/page.tsx`
- `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx` (issues tab)

### J. Docs

**New:** `docs/plans/phase-13-multi-tenancy-pagination-search.md` (this file)
**Modify:** `docs/plans/implementation-phases.md` — mark Phase 13 ✅

---

## API Changes

| Method | Endpoint | Change |
|--------|----------|--------|
| GET | All list endpoints | Now return `{ next, previous, results }` instead of raw arrays |
| GET | All list endpoints | Accept `?q=` for text search where applicable |
| GET | `/api/v1/organizations/{slug}/search/?q=` | **NEW** — global search across issues, projects, teams, labels |

---

## File Manifest

| Section | Files |
|---------|-------|
| A (Pagination) | `backend/common/pagination.py` (new), `backend/config/settings/base.py` (modify) |
| B (Paginate Views) | `backend/common/mixins.py` (new), all `views/*.py` files (modify) |
| C (DB Indexes) | 9 model files (modify), migrations (generated) |
| D (Search Selectors) | 4 selector files (modify), corresponding views (modify) |
| E (Global Search) | `backend/organizations/selectors/search_selector.py` (new), `backend/organizations/views/search_views.py` (new), serializers + URLs (modify) |
| F (FE Pagination) | `frontend/types/index.ts` (modify), all `frontend/lib/api/*.ts` (modify) |
| G (FE Search API) | `frontend/lib/api/search.ts` (new) |
| H (FE Search UI) | `frontend/components/search-command-palette.tsx` (new), `frontend/hooks/use-debounce.ts` (new), `frontend/components/sidebar.tsx` (modify) |
| I (FE Load More) | 8 page files (modify) |
| J (Docs) | this file (new), `docs/plans/implementation-phases.md` (modify) |

---

## Key Decisions

1. **Cursor pagination over offset** — cursor pagination is more efficient for large datasets and prevents skipping/duplicates during concurrent writes. DRF's CursorPagination uses signed cursors based on ordering field.
2. **PaginatedViewMixin for APIView** — since we use raw `APIView` (not `GenericAPIView`), we add a mixin that instantiates the paginator. This is minimally invasive.
3. **Django SearchVector for full-text** — uses PostgreSQL's native tsvector/tsquery via Django's ORM. No extra dependencies needed.
4. **Command palette (Cmd+K) for search** — modern UX pattern used by Linear, GitHub, etc. More discoverable than a search page.
5. **Backward-compatible pagination** — frontend updated to handle `{ results }` wrapper, with "Load more" pattern for all lists.
