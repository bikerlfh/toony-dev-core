# Phase 11: Agents & Skills Registry

## Context

Phases 1–10 built the full-stack project management foundation with auth, organizations, teams, projects, issues, credentials, and integrations. Phase 11 adds the **Agent** and **Skill** registries — org-scoped models that define AI agents and reusable skill definitions. These are prerequisites for agent task assignment (Phase 14) and the import system (Phase 12).

All models live in the existing **agents** app (already scaffolded with `apps.py` and registered in `INSTALLED_APPS`). Agent `encrypted_configuration` uses `EncryptedTextField` with JSON serialization (same pattern as IntegrationConfig). Encrypted fields are **write-only** — never returned in API responses.

---

## Plan

### A. Backend Models

**New:** `backend/agents/models/agent.py`
- `AgentStatus` TextChoices: `DRAFT`, `ACTIVE`, `INACTIVE`, `DEPRECATED`
- `AgentType` TextChoices: `CODER`, `REVIEWER`, `TESTER`, `PLANNER`, `CUSTOM`
- `Agent(BaseModel)`: organization FK, name, slug, description, version, status, agent_type, capabilities (JSONField), encrypted_configuration (EncryptedTextField), max_concurrent_tasks, created_by FK(User), tags (JSONField), assigned_projects M2M(Project, blank)
- UniqueConstraint on `(organization, slug)`, `db_table = "agents"`

**New:** `backend/agents/models/skill.py`
- `SkillStatus` TextChoices: `DRAFT`, `ACTIVE`, `INACTIVE`, `DEPRECATED`
- `SkillCategory` TextChoices: `CODING`, `TESTING`, `REVIEW`, `DOCUMENTATION`, `DEPLOYMENT`, `CUSTOM`
- `Skill(BaseModel)`: organization FK, name, slug, description, version, status, content (TextField), category, input_schema (JSONField null), output_schema (JSONField null), compatible_agent_types (JSONField), created_by FK(User), tags (JSONField)
- UniqueConstraint on `(organization, slug)`, `db_table = "skills"`

**New:** `backend/agents/models/agent_skill.py`
- `AgentSkill(BaseModel)`: agent FK, skill FK, priority (IntegerField), is_enabled (BooleanField default True), custom_config (JSONField null)
- UniqueConstraint on `(agent, skill)`, `db_table = "agent_skills"`

**New:** `backend/agents/models/skill_version.py`
- `SkillVersion(BaseModel)`: skill FK, version (CharField), content (TextField), changelog (TextField), created_by FK(User)
- `db_table = "skill_versions"`, ordering by `-created_at`

**New:** `backend/agents/models/__init__.py` — export all models + enums

### B. Backend Selectors

**New:** `backend/agents/selectors/agent_selector.py`
- `list_organization_agents(organization)` → QuerySet ordered by name
- `get_agent_by_slug(organization, slug)` → instance or None
- `get_agent_by_id(organization, agent_id)` → instance or None

**New:** `backend/agents/selectors/skill_selector.py`
- `list_organization_skills(organization)` → QuerySet ordered by name
- `get_skill_by_slug(organization, slug)` → instance or None
- `get_skill_by_id(organization, skill_id)` → instance or None
- `list_skill_versions(skill)` → QuerySet ordered by -created_at

**New:** `backend/agents/selectors/agent_skill_selector.py`
- `list_agent_skills(agent)` → QuerySet with select_related("skill"), ordered by priority
- `get_agent_skill_by_id(agent, agent_skill_id)` → instance or None

**New:** `backend/agents/selectors/__init__.py` — re-export

### C. Backend Services

**New:** `backend/agents/services/agent_service.py`
- `create_agent(organization, created_by, name, slug, **kwargs)` — ConflictError on duplicate slug
- `update_agent(agent, **kwargs)` — allowed_fields whitelist
- `delete_agent(agent)`

**New:** `backend/agents/services/skill_service.py`
- `create_skill(organization, created_by, name, slug, **kwargs)` — ConflictError on duplicate slug
- `update_skill(skill, **kwargs)` — allowed_fields whitelist; auto-create SkillVersion when content changes
- `delete_skill(skill)`

**New:** `backend/agents/services/agent_skill_service.py`
- `assign_skill(agent, skill, priority=0, custom_config=None)` — ConflictError on duplicate
- `update_agent_skill(agent_skill, **kwargs)` — allowed_fields whitelist
- `remove_agent_skill(agent_skill)`

**New:** `backend/agents/services/__init__.py` — re-export

### D. Backend Serializers

**New:** `backend/agents/serializers/__init__.py`

**New:** `backend/agents/serializers/input.py`
- `CreateAgentSerializer`: name, slug, description, version, status, agent_type, capabilities, encrypted_configuration, max_concurrent_tasks, tags
- `UpdateAgentSerializer`: all optional + assigned_projects (list of UUIDs)
- `CreateSkillSerializer`: name, slug, description, version, status, content, category, input_schema, output_schema, compatible_agent_types, tags
- `UpdateSkillSerializer`: all optional
- `CreateAgentSkillSerializer`: skill (UUID), priority, custom_config
- `UpdateAgentSkillSerializer`: priority, is_enabled, custom_config — all optional

**New:** `backend/agents/serializers/output.py`
- `AgentListSerializer`: id, name, slug, status, agent_type, version, max_concurrent_tasks, created_at — **NO encrypted_configuration**
- `AgentDetailSerializer`: all list fields + description, capabilities, tags, created_at, updated_at — **NO encrypted_configuration**
- `SkillListSerializer`: id, name, slug, status, category, version, created_at
- `SkillDetailSerializer`: all list fields + description, content, input_schema, output_schema, compatible_agent_types, tags, created_at, updated_at
- `AgentSkillSerializer`: id, skill (nested SkillListSerializer), priority, is_enabled, custom_config, assigned_at (created_at)
- `SkillVersionSerializer`: id, version, content, changelog, created_by, created_at

### E. Backend Views

**New:** `backend/agents/views/agent_views.py`
- `AgentListCreateView(APIView)`: GET list (IsOrganizationMember), POST create (IsOrganizationAdmin)
- `AgentDetailView(APIView)`: GET (IsOrganizationMember), PUT/DELETE (IsOrganizationAdmin)

**New:** `backend/agents/views/skill_views.py`
- `SkillListCreateView(APIView)`: GET list (IsOrganizationMember), POST create (IsOrganizationAdmin)
- `SkillDetailView(APIView)`: GET (IsOrganizationMember), PUT/DELETE (IsOrganizationAdmin)
- `SkillVersionListView(APIView)`: GET (IsOrganizationMember)

**New:** `backend/agents/views/agent_skill_views.py`
- `AgentSkillListCreateView(APIView)`: GET list, POST assign — IsOrganizationAdmin
- `AgentSkillDetailView(APIView)`: GET, PUT, DELETE — IsOrganizationAdmin

**New:** `backend/agents/views/__init__.py` — re-export

### F. URLs, Admin, Migrations

**New:** `backend/agents/urls.py` — 8 URL patterns:
- `agents/` → AgentListCreateView
- `agents/<slug:agent_slug>/` → AgentDetailView
- `agents/<slug:agent_slug>/skills/` → AgentSkillListCreateView
- `agents/<slug:agent_slug>/skills/<uuid:agent_skill_id>/` → AgentSkillDetailView
- `skills/` → SkillListCreateView
- `skills/<slug:skill_slug>/` → SkillDetailView
- `skills/<slug:skill_slug>/versions/` → SkillVersionListView

**New:** `backend/agents/admin.py` — register Agent (exclude encrypted_configuration), Skill, AgentSkill, SkillVersion

**Modify:** `backend/config/urls.py` — add `path("api/v1/organizations/<slug:org_slug>/", include("agents.urls"))`

**Generate:** `backend/agents/migrations/` — auto-generated for new models

### G. Frontend Types & API

**New:** `frontend/types/agents.ts`
- `AgentStatus`, `AgentType`, `SkillStatus`, `SkillCategory` union types
- `AgentList`, `AgentDetail`, `CreateAgentPayload`, `UpdateAgentPayload`
- `SkillList`, `SkillDetail`, `CreateSkillPayload`, `UpdateSkillPayload`
- `AgentSkill`, `CreateAgentSkillPayload`, `UpdateAgentSkillPayload`
- `SkillVersion`

**Modify:** `frontend/types/index.ts` — re-export new types

**New:** `frontend/lib/api/agents.ts` — `listAgents`, `createAgent`, `getAgent`, `updateAgent`, `deleteAgent`

**New:** `frontend/lib/api/skills.ts` — `listSkills`, `createSkill`, `getSkill`, `updateSkill`, `deleteSkill`, `listSkillVersions`

**New:** `frontend/lib/api/agent-skills.ts` — `listAgentSkills`, `assignSkill`, `updateAgentSkill`, `removeAgentSkill`

**Modify:** `frontend/lib/api/index.ts` — re-export new functions

### H. Frontend UI

**New:** `frontend/app/(dashboard)/[orgSlug]/agents/page.tsx`
- Tabbed page: "Agents" and "Skills" tabs
- Agents tab: table (name, type, status, version, actions) with Add button
- Skills tab: table (name, category, status, version, actions) with Add button
- Edit/Delete actions per row; Delete uses ConfirmModal

**New:** `frontend/components/create-agent-modal.tsx`
- Fields: name, slug (auto-from-name), agent_type (select), version, description, capabilities (textarea JSON), encrypted_configuration (textarea, password-like), max_concurrent_tasks, tags (comma-separated)

**New:** `frontend/components/edit-agent-modal.tsx`
- Same form pre-populated (encrypted_configuration placeholder)

**New:** `frontend/components/create-skill-modal.tsx`
- Fields: name, slug, category (select), version, description, content (textarea), compatible_agent_types (multi-select), tags

**New:** `frontend/components/edit-skill-modal.tsx`
- Same form pre-populated

**Modify:** `frontend/components/sidebar.tsx` — add `{ label: "Agents", path: "/agents" }` before Credentials

### I. Phase Plan Doc & Tracking

**New:** `docs/plans/phase-11-agents-skills-registry.md` (this file)
**Modify:** `docs/plans/implementation-phases.md` — mark Phase 11 Plan Generated ✅ and Implemented ✅

---

## API Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `…/agents/` | IsOrganizationMember | List agents |
| POST | `…/agents/` | IsOrganizationAdmin | Create agent |
| GET | `…/agents/{slug}/` | IsOrganizationMember | Get agent |
| PUT | `…/agents/{slug}/` | IsOrganizationAdmin | Update agent |
| DELETE | `…/agents/{slug}/` | IsOrganizationAdmin | Delete agent |
| GET | `…/agents/{slug}/skills/` | IsOrganizationAdmin | List agent skills |
| POST | `…/agents/{slug}/skills/` | IsOrganizationAdmin | Assign skill to agent |
| GET | `…/agents/{slug}/skills/{id}/` | IsOrganizationAdmin | Get agent skill |
| PUT | `…/agents/{slug}/skills/{id}/` | IsOrganizationAdmin | Update agent skill |
| DELETE | `…/agents/{slug}/skills/{id}/` | IsOrganizationAdmin | Remove skill from agent |
| GET | `…/skills/` | IsOrganizationMember | List skills |
| POST | `…/skills/` | IsOrganizationAdmin | Create skill |
| GET | `…/skills/{slug}/` | IsOrganizationMember | Get skill |
| PUT | `…/skills/{slug}/` | IsOrganizationAdmin | Update skill |
| DELETE | `…/skills/{slug}/` | IsOrganizationAdmin | Delete skill |
| GET | `…/skills/{slug}/versions/` | IsOrganizationMember | List skill versions |

All endpoints prefixed with `/api/v1/organizations/{org_slug}/`.

---

## File Manifest

**22 new files, 4 modified files:**

| Section | Files |
|---------|-------|
| A (Models) | `backend/agents/models/agent.py` (new), `backend/agents/models/skill.py` (new), `backend/agents/models/agent_skill.py` (new), `backend/agents/models/skill_version.py` (new), `backend/agents/models/__init__.py` (new) |
| B (Selectors) | `backend/agents/selectors/agent_selector.py` (new), `backend/agents/selectors/skill_selector.py` (new), `backend/agents/selectors/agent_skill_selector.py` (new), `backend/agents/selectors/__init__.py` (new) |
| C (Services) | `backend/agents/services/agent_service.py` (new), `backend/agents/services/skill_service.py` (new), `backend/agents/services/agent_skill_service.py` (new), `backend/agents/services/__init__.py` (new) |
| D (Serializers) | `backend/agents/serializers/__init__.py` (new), `backend/agents/serializers/input.py` (new), `backend/agents/serializers/output.py` (new) |
| E (Views) | `backend/agents/views/agent_views.py` (new), `backend/agents/views/skill_views.py` (new), `backend/agents/views/agent_skill_views.py` (new), `backend/agents/views/__init__.py` (new) |
| F (URLs/Admin) | `backend/agents/urls.py` (new), `backend/agents/admin.py` (new), `backend/config/urls.py` (modify) |
| G (FE Types/API) | `frontend/types/agents.ts` (new), `frontend/types/index.ts` (modify), `frontend/lib/api/agents.ts` (new), `frontend/lib/api/skills.ts` (new), `frontend/lib/api/agent-skills.ts` (new), `frontend/lib/api/index.ts` (modify) |
| H (FE UI) | `frontend/app/(dashboard)/[orgSlug]/agents/page.tsx` (new), `frontend/components/create-agent-modal.tsx` (new), `frontend/components/edit-agent-modal.tsx` (new), `frontend/components/create-skill-modal.tsx` (new), `frontend/components/edit-skill-modal.tsx` (new), `frontend/components/sidebar.tsx` (modify) |

---

## Key Decisions

1. **Dedicated agents app** — already scaffolded and in INSTALLED_APPS; keeps agent domain separate from organizations/projects.
2. **EncryptedTextField for agent config** — same pattern as IntegrationConfig: JSON-serialized string in EncryptedTextField, excluded from API output.
3. **JSONField for tags & capabilities** — avoids PostgreSQL-specific ArrayField while providing the same functionality.
4. **Auto SkillVersion on content change** — `update_skill` service auto-creates a SkillVersion when content is modified.
5. **Mixed permissions** — read operations allow IsOrganizationMember; write operations require IsOrganizationAdmin.
6. **Tabbed agents page** — combined Agents + Skills view at `/{orgSlug}/agents/`, keeping the sidebar compact.

---

## Verification

1. `makemigrations` generates migrations for agents app
2. API: CRUD agents, skills, agent-skills via curl — verify encrypted_configuration absent from responses
3. API: verify permission differentiation (member can read, only admin can write)
4. API: verify ConflictError (409) for duplicate slugs / duplicate agent-skill
5. API: verify SkillVersion auto-created on skill content update
6. `cd frontend && ./node_modules/.bin/next build` — builds with no errors
7. Frontend: navigate to /{orgSlug}/agents, verify both tabs load, CRUD modals work
