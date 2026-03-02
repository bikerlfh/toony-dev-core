# Phase 12: Import System — Plugin Architecture

## Context

Phases 1–11 built the full-stack project management app with auth, organizations, teams, projects, issues, credentials, integrations, agents, and skills. Phase 12 adds the **Import System** — a plugin-based architecture for importing projects and issues from external tools (Linear, Jira, Trello, etc.).

The system consists of:
- **ImportPlugin ABC** — abstract base class that all provider plugins implement
- **LinearPlugin** — first concrete plugin using the Linear API
- **ImportJob / ImportMapping** — models tracking import progress and external↔internal ID mappings
- **Import service** — orchestrates the import flow using plugins
- **Import wizard UI** — frontend page for selecting provider, project, and triggering imports

All models live in the existing **importers** app (already scaffolded). The import system uses **IntegrationConfig** (Phase 10) for provider credentials.

---

## Plan

### A. Backend Plugin ABC & LinearPlugin

**New:** `backend/importers/plugins/__init__.py`
- `ExternalProject` dataclass: id, name, description, url
- `ExternalIssue` dataclass: id, title, description, status, priority, labels, assignee_email, created_at
- `ImportPlugin(ABC)`: abstract base with methods:
  - `provider: str` class attribute
  - `authenticate(credentials: dict) -> bool`
  - `list_projects() -> list[ExternalProject]`
  - `fetch_issues(project_id: str) -> list[ExternalIssue]`

**New:** `backend/importers/plugins/linear_plugin.py`
- `LinearPlugin(ImportPlugin)`: implements all methods using Linear GraphQL API via `httpx`
- `authenticate()` — verifies API key with a simple viewer query
- `list_projects()` — fetches Linear teams (Linear "projects" map to our projects)
- `fetch_issues(project_id)` — fetches all issues for a Linear team

**New:** `backend/importers/plugins/registry.py`
- `PLUGIN_REGISTRY: dict[str, type[ImportPlugin]]` — maps provider strings to plugin classes
- `get_plugin(provider: str) -> ImportPlugin` — factory function

### B. Backend Models

**New:** `backend/importers/models/import_job.py`
- `ImportJobStatus` TextChoices: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `PARTIALLY_COMPLETED`
- `ImportProvider` TextChoices: `LINEAR`, `JIRA`, `TRELLO`, `ASANA`, `GITHUB_PROJECTS`
- `ImportJob(BaseModel)`: organization FK, target_project FK(Project, null), provider, status, config (JSONField), progress (0-100), total_items, imported_items, error_log (JSONField), started_by FK(User), started_at, completed_at
- `db_table = "import_jobs"`

**New:** `backend/importers/models/import_mapping.py`
- `ImportMapping(BaseModel)`: import_job FK, external_id, external_type, internal_id (UUIDField), internal_type
- `db_table = "import_mappings"`, UniqueConstraint on `(import_job, external_id, external_type)`

**New:** `backend/importers/models/__init__.py` — export models + enums

### C. Backend Selectors

**New:** `backend/importers/selectors/import_selector.py`
- `list_organization_import_jobs(organization)` → QuerySet ordered by -created_at
- `get_import_job_by_id(organization, job_id)` → instance or None
- `list_import_mappings(import_job)` → QuerySet

**New:** `backend/importers/selectors/__init__.py` — re-export

### D. Backend Services

**New:** `backend/importers/services/import_service.py`
- `start_import(organization, started_by, provider, config, target_project=None)` — creates ImportJob(PENDING), resolves plugin, authenticates with IntegrationConfig credentials, fetches issues, creates internal Issue + Label objects, creates ImportMappings, updates progress
- `_run_import(import_job, plugin, credentials)` — inner import logic
- `list_external_projects(organization, provider)` — authenticates and returns plugin.list_projects()

**New:** `backend/importers/services/__init__.py` — re-export

### E. Backend Serializers

**New:** `backend/importers/serializers/__init__.py`

**New:** `backend/importers/serializers/input.py`
- `StartImportSerializer`: provider (ChoiceField), external_project_id (CharField), config (JSONField, optional)
- `ListExternalProjectsSerializer`: provider (ChoiceField)

**New:** `backend/importers/serializers/output.py`
- `ImportJobListSerializer`: id, provider, status, progress, total_items, imported_items, created_at
- `ImportJobDetailSerializer`: all list fields + config, error_log, started_by, started_at, completed_at
- `ImportMappingSerializer`: id, external_id, external_type, internal_id, internal_type, created_at
- `ExternalProjectSerializer`: id, name, description, url (plain Serializer)

### F. Backend Views

**New:** `backend/importers/views/import_views.py`
- `ImportJobListCreateView(APIView)`: GET list org jobs, POST start import — IsOrganizationAdmin
- `ImportJobDetailView(APIView)`: GET detail — IsOrganizationAdmin
- `ImportJobLogView(APIView)`: GET mappings — IsOrganizationAdmin
- `ExternalProjectsView(APIView)`: POST list external projects — IsOrganizationAdmin

**New:** `backend/importers/views/__init__.py` — re-export

### G. URLs, Admin, Migrations

**New:** `backend/importers/urls.py` — 4 URL patterns:
- `imports/` → ImportJobListCreateView
- `imports/<uuid:job_id>/` → ImportJobDetailView
- `imports/<uuid:job_id>/mappings/` → ImportJobLogView
- `imports/external-projects/` → ExternalProjectsView

**New:** `backend/importers/admin.py` — register ImportJob, ImportMapping

**Modify:** `backend/config/urls.py` — add `path("api/v1/organizations/<slug:org_slug>/", include("importers.urls"))`

**Generate:** `backend/importers/migrations/` — auto-generated

### H. Frontend Types & API

**New:** `frontend/types/imports.ts`
- `ImportJobStatus`, `ImportProvider` union types
- `ImportJob`, `ImportJobDetail`, `ImportMapping`, `ExternalProject`
- `StartImportPayload`

**Modify:** `frontend/types/index.ts` — re-export

**New:** `frontend/lib/api/imports.ts` — `listImportJobs`, `startImport`, `getImportJob`, `getImportMappings`, `listExternalProjects`

**Modify:** `frontend/lib/api/index.ts` — re-export

### I. Frontend UI

**New:** `frontend/app/(dashboard)/[orgSlug]/imports/page.tsx`
- Two sections: "Start Import" wizard at top, "Import History" table below
- Wizard: select provider → load external projects → select one → start import
- History table: shows all import jobs with status, progress bar, timestamps
- Click on job shows detail with error log + mappings count

**New:** `frontend/components/start-import-wizard.tsx`
- Step 1: Select provider (dropdown from configured integrations)
- Step 2: Select external project (fetched via API)
- Step 3: Confirm and start import

**Modify:** `frontend/components/sidebar.tsx` — add `{ label: "Imports", path: "/imports" }` after Agents

### J. Phase Plan Doc & Tracking

**New:** `docs/plans/phase-12-import-system.md` (this file)
**Modify:** `docs/plans/implementation-phases.md` — mark Phase 12 ✅

---

## API Endpoints

All endpoints prefixed with `/api/v1/organizations/{org_slug}/`.

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `…/imports/` | IsOrganizationAdmin | List import jobs |
| POST | `…/imports/` | IsOrganizationAdmin | Start import |
| GET | `…/imports/{id}/` | IsOrganizationAdmin | Get import job detail |
| GET | `…/imports/{id}/mappings/` | IsOrganizationAdmin | Get import mappings |
| POST | `…/imports/external-projects/` | IsOrganizationAdmin | List external projects |

---

## Key Decisions

1. **importers app** — already scaffolded; keeps import logic separate from projects/organizations.
2. **Plugin ABC with registry** — clean extensibility pattern; new providers only need a plugin class + registry entry.
3. **Synchronous import** — for Phase 12, imports run synchronously in the request. Async (Celery) deferred to Phase 15.
4. **LinearPlugin uses httpx** — lightweight HTTP client for GraphQL calls to Linear API.
5. **IntegrationConfig for credentials** — reuses Phase 10 encrypted credentials; plugin.authenticate() decrypts and validates.
6. **ImportMapping for ID tracking** — enables future re-imports and cross-reference between external and internal IDs.

---

## Verification

1. `makemigrations` generates migrations for importers app
2. API: POST to `/imports/external-projects/` returns list from Linear (with valid integration config)
3. API: POST to `/imports/` triggers import and creates ImportJob + ImportMappings
4. API: GET import job shows progress and error_log
5. `cd frontend && ./node_modules/.bin/next build` — builds with no errors
6. Frontend: navigate to /{orgSlug}/imports, verify wizard and history table
