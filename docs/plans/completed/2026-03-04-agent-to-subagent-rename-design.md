# Agent → SubAgent Rename + AI Studio Sidebar

**Date:** 2026-03-04

## Summary

Rename the `Agent` model to `SubAgent` across the full stack (backend model, API, frontend types/routes). Restructure the sidebar to group SubAgents, Skills, and Toony Agents under a collapsible "AI Studio" section.

## Decisions

- **DB migration:** Full rename — table `agents` → `sub_agents`, constraints updated
- **Django app name:** Keep as `agents/` directory and `agents` in INSTALLED_APPS (renaming Django apps is painful for no user-facing benefit)
- **API URLs:** `/subagents/` (no hyphen), `/subagents/<slug>/skills/`
- **Frontend routes:** `/[orgSlug]/subagents/`
- **WebSocket:** `ws/subagents/<id>/`
- **Sidebar group name:** "AI Studio" with collapsible submenu
- **Toony Agents:** Moves inside AI Studio group (not renamed)

## 1. Backend Model Rename

### Model classes (in `agents/models/`)

| Before | After | File rename |
|--------|-------|-------------|
| `Agent` | `SubAgent` | `agent.py` → `sub_agent.py` |
| `AgentStatus` | `SubAgentStatus` | same file |
| `AgentType` | `SubAgentType` | same file |
| `AgentSkill` | `SubAgentSkill` | `agent_skill.py` → `sub_agent_skill.py` |

DB tables: `agents` → `sub_agents`, `agent_skills` → `sub_agent_skills`

Related names:
- `Organization.agents` → `Organization.sub_agents`
- `Project.assigned_agents` → `Project.assigned_sub_agents`
- `User.created_agents` → `User.created_sub_agents`
- `Agent.agent_skills` → `SubAgent.sub_agent_skills`
- `Skill.agent_skills` → `Skill.sub_agent_skills`

Constraints: `unique_org_agent_slug` → `unique_org_sub_agent_slug`, `unique_global_agent_slug` → `unique_global_sub_agent_slug`

### Serializers (in `agents/serializers/`)

| Before | After |
|--------|-------|
| `CreateAgentSerializer` | `CreateSubAgentSerializer` |
| `UpdateAgentSerializer` | `UpdateSubAgentSerializer` |
| `AgentListSerializer` | `SubAgentListSerializer` |
| `AgentDetailSerializer` | `SubAgentDetailSerializer` |
| `CreateAgentSkillSerializer` | `CreateSubAgentSkillSerializer` |
| `UpdateAgentSkillSerializer` | `UpdateSubAgentSkillSerializer` |
| `AgentSkillSerializer` | `SubAgentSkillSerializer` |

### Services (in `agents/services/`)

| Before | After | File rename |
|--------|-------|-------------|
| `create_agent()` | `create_sub_agent()` | `agent_service.py` → `sub_agent_service.py` |
| `update_agent()` | `update_sub_agent()` | same |
| `delete_agent()` | `delete_sub_agent()` | same |
| `assign_skill()` | `assign_skill()` | `agent_skill_service.py` → `sub_agent_skill_service.py` |
| `update_agent_skill()` | `update_sub_agent_skill()` | same |
| `remove_agent_skill()` | `remove_sub_agent_skill()` | same |

### Selectors (in `agents/selectors/`)

| Before | After | File rename |
|--------|-------|-------------|
| `list_agents_for_user()` | `list_sub_agents_for_user()` | `agent_selector.py` → `sub_agent_selector.py` |
| `list_agents_for_organization()` | `list_sub_agents_for_organization()` | same |
| `get_agent_by_slug()` | `get_sub_agent_by_slug()` | same |
| `get_agent_by_id()` | `get_sub_agent_by_id()` | same |
| `list_agent_skills()` | `list_sub_agent_skills()` | `agent_skill_selector.py` → `sub_agent_skill_selector.py` |
| `get_agent_skill_by_id()` | `get_sub_agent_skill_by_id()` | same |

### Views (in `agents/views/`)

| Before | After | File rename |
|--------|-------|-------------|
| `AgentListCreateView` | `SubAgentListCreateView` | `agent_views.py` → `sub_agent_views.py` |
| `AgentDetailView` | `SubAgentDetailView` | same |
| `AgentSkillListCreateView` | `SubAgentSkillListCreateView` | `agent_skill_views.py` → `sub_agent_skill_views.py` |
| `AgentSkillDetailView` | `SubAgentSkillDetailView` | same |

### URLs (`agents/urls.py`)

```
subagents/                              → SubAgentListCreateView
subagents/<slug:sub_agent_slug>/        → SubAgentDetailView
subagents/<slug:sub_agent_slug>/skills/ → SubAgentSkillListCreateView
subagents/<slug:sub_agent_slug>/skills/<uuid:sub_agent_skill_id>/ → SubAgentSkillDetailView
skills/                                 → (unchanged)
skills/<slug:skill_slug>/               → (unchanged)
skills/<slug:skill_slug>/versions/      → (unchanged)
```

### WebSocket

- `AgentConsumer` → `SubAgentConsumer`
- Path: `ws/subagents/<uuid:sub_agent_id>/`
- Group name: `sub_agent_{id}`

### Admin

- `AgentAdmin` → `SubAgentAdmin`
- `AgentSkillAdmin` → `SubAgentSkillAdmin`

### Migration

Run `makemigrations` after all model changes. Expect:
- Table rename `agents` → `sub_agents`
- Table rename `agent_skills` → `sub_agent_skills`
- M2M table rename for `assigned_projects`
- Constraint renames

## 2. Frontend Rename

### Types (`types/agents.ts`)

| Before | After |
|--------|-------|
| `AgentStatus` | `SubAgentStatus` |
| `AgentType` | `SubAgentType` |
| `AgentList` | `SubAgentList` |
| `AgentDetail` | `SubAgentDetail` |
| `CreateAgentPayload` | `CreateSubAgentPayload` |
| `UpdateAgentPayload` | `UpdateSubAgentPayload` |
| `AgentSkill` | `SubAgentSkill` |
| `CreateAgentSkillPayload` | `CreateSubAgentSkillPayload` |
| `UpdateAgentSkillPayload` | `UpdateSubAgentSkillPayload` |

Skill types unchanged.

### API module (`lib/api/agents.ts`)

| Before | After |
|--------|-------|
| `listAgents()` | `listSubAgents()` |
| `createAgent()` | `createSubAgent()` |
| `getAgent()` | `getSubAgent()` |
| `updateAgent()` | `updateSubAgent()` |
| `deleteAgent()` | `deleteSubAgent()` |

API paths: `/organizations/${orgSlug}/subagents/`

`lib/api/agent-skills.ts` → `lib/api/sub-agent-skills.ts` with similar renames.

### Routes

Directory rename: `app/(dashboard)/[orgSlug]/agents/` → `app/(dashboard)/[orgSlug]/subagents/`

SubAgents pages:
- `subagents/page.tsx` — SubAgents list only (no skills tab)
- `subagents/new/page.tsx` — Create SubAgent
- `subagents/[agentSlug]/edit/page.tsx` — Edit SubAgent

Skills pages (new separate route):
- `skills/page.tsx` — Skills list (extracted from old agents page)
- `skills/new/page.tsx` — Create Skill
- `skills/[skillSlug]/edit/page.tsx` — Edit Skill

### WebSocket hook

`use-agent-websocket.ts` — Update WS URL to `ws/subagents/{id}/`

### UI labels

All user-facing text "Agent" → "SubAgent" or "Sub-Agent" in headings/buttons/toasts.

## 3. Sidebar — AI Studio Collapsible Section

### Structure

```
Dashboard
Teams
Projects
Labels
Members
AI Studio              ▾
  SubAgents
  Skills
  Toony Agents
Imports
Credentials
Settings
```

### Implementation

- Add `children` property to nav item type
- AI Studio item has no `path` of its own (section header only)
- Icon: sparkles SVG (Heroicons `SparklesIcon` or similar)
- Collapsible state via `useState`, default expanded when any child route is active
- Chevron icon rotates on toggle (▸ collapsed, ▾ expanded)
- Child items indented with `pl-4` or similar
- Skills gets its own dedicated route `/[orgSlug]/skills` (currently it's a tab within agents page)

### Skills as separate route

Currently Skills is a tab within the agents page (`/agents?tab=skills`). With the sidebar split, Skills gets its own route:

- `app/(dashboard)/[orgSlug]/skills/page.tsx` — Skills list (extracted from agents page)
- `app/(dashboard)/[orgSlug]/skills/new/page.tsx` — Create Skill (moved from `subagents/skills/new/`)
- `app/(dashboard)/[orgSlug]/skills/[skillSlug]/edit/page.tsx` — Edit Skill (moved from `subagents/skills/[skillSlug]/edit/`)

The SubAgents page (`/subagents/page.tsx`) drops the skills tab — it only shows SubAgents.

Sidebar links:
- "SubAgents" → `/[orgSlug]/subagents`
- "Skills" → `/[orgSlug]/skills`
- "Toony Agents" → `/[orgSlug]/toony-agents`

## 4. Not touched

- `toony_agents/` backend app — no rename
- `ToonyAgent` model/types — no rename
- `Skill` model — no rename (only `AgentSkill` → `SubAgentSkill`)
- Frontend `toony-agents/` pages — only sidebar placement changes
