# Auto-create AgentTask when Issue moves to TODO

## Overview

When an issue's status transitions from BACKLOG to TODO, automatically create an AgentTask assigned to the most recently connected ToonyAgent associated with the issue's organization.

## Model Changes

### AgentTask — new field

- `issue`: FK to Issue, nullable, blank, `SET_NULL`, `related_name="agent_tasks"`
- The issue must belong to the same project/organization as the task

### ProjectSettings — new field

- `auto_task_prompt_template`: TextField, nullable, blank
- Override per project for the prompt template used when auto-creating tasks
- Falls back to `DEFAULT_AGENT_TASK_PROMPT_TEMPLATE` env var if empty

### Environment Variable

- `DEFAULT_AGENT_TASK_PROMPT_TEMPLATE`: Global default prompt template
- Example: `"Use toony skill and implement {issue_identifier}"`
- Supported variables: `{issue_id}`, `{issue_identifier}`

## Logic: Trigger in `update_issue`

When status changes from BACKLOG to TODO (inline in `update_issue` service, within `transaction.atomic()`):

1. Query ToonyAgents with the issue's organization in their M2M (`organizations` field)
2. If none found: log warning, proceed with status change normally (no task created)
3. If found: select the one with the most recent `last_connected_at`
4. Resolve prompt template:
   - Use `ProjectSettings.auto_task_prompt_template` if set
   - Otherwise use `DEFAULT_AGENT_TASK_PROMPT_TEMPLATE` env var
   - Replace `{issue_id}` with issue UUID, `{issue_identifier}` with readable identifier (e.g., "ENG-42")
5. Call `create_agent_task` with:
   - `organization`: issue's project organization
   - `project`: issue's project
   - `issue`: the issue
   - `toony_agent`: selected agent
   - `created_by`: user who changed the status
   - `title`: issue title
   - `prompt`: resolved template

## Agent Selection

- Filter: ToonyAgents with the issue's organization in M2M
- Sort by: `last_connected_at` descending (most recent first)
- Pick first (regardless of online/offline status — the runner will execute when the agent connects)

## Edge Cases

- No ToonyAgent with the org: silent skip + log warning
- No prompt template configured (neither project nor env var): silent skip + log warning
- `created_by`: the user who triggered the status change

## Not in Scope

- Override prompt per issue (manual task creation covers this)
- UI for ProjectSettings prompt template (can be added later)
- Additional template variables beyond `{issue_id}` and `{issue_identifier}`
