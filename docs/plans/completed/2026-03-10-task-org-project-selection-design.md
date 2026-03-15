# Task Creation: Organization & Project Selection

## Goal

Add organization (required) and project (optional) selection to the CreateTaskModal. Organization dropdown is populated from agent's assigned organizations. Project dropdown appears when an org is selected, filtered by that org. If only one org, auto-select and disable.

## Changes

### Frontend — CreateTaskModal
- New props: `organizations` (from agent detail)
- Organization dropdown (required), auto-selected if only one, disabled if only one
- Project dropdown (optional), fetched on org change via `listProjects` with `?organization=` param
- Field order: Organization -> Project -> Title -> Prompt
- Payload includes `organization_id` and optional `project_id`

### Frontend — Types & API
- Add `organization_id` and `project_id?` to `CreateAgentTaskPayload`
- Add `organization` query param support to `listProjects`

### Backend — Serializer
- Add `organization_id` (required UUID) and `project_id` (optional UUID) to `CreateAgentTaskSerializer`

### Backend — View
- Use `organization_id` from payload instead of auto-inferring
- Validate org belongs to agent and user is member
- Resolve project if `project_id` provided, validate it belongs to the org

### Backend — Service
- Add `project` param to `create_agent_task`, set on AgentTask
- Include `project_id` in `task_assign` broadcast

### Backend — Project list view
- Support `?organization=` query param to filter projects
