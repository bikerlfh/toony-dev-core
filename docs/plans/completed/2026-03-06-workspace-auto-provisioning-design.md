# Workspace Auto-Provisioning on Runner Connect

**Date:** 2026-03-06
**Status:** Approved

## Problem

Today the `toony_agent_runner` requires manual setup of `organizations.yaml` and `workspace-registry.yaml` files. Operators must manually list orgs, configure integrations, enumerate projects, and clone repos. This is error-prone and creates drift between the backend's state and the runner's local config.

## Solution

When a runner connects, the backend sends a `config.sync` message containing all associated organizations and their projects. The runner auto-provisions the local directory structure and writes org-level config files (full overwrite). The user can also trigger a sync manually from the frontend. The runner becomes fully self-provisioning.

## Directory Structure

```
~/work/                                          # workspace_root (configurable in config.yml)
  myorg/
    .toony/
      workspace-registry.yaml                    # backend-synced, full overwrite on every sync
    projects/
      backend-api/                               # cloned manually or via git_clone command
        .toony/
          local.yaml                             # optional local overrides (never touched by sync)
        CLAUDE.md
        ...
      frontend/
        .toony/
          local.yaml
        ...
  othercorp/
    .toony/
      workspace-registry.yaml
    projects/
      ...
```

## Property Classification

Properties from the original `workspace-registry.example.yaml` fall into three categories:

| Category | Properties | Rationale |
|----------|-----------|-----------|
| **Backend-synced** (written to `workspace-registry.yaml`) | `organization`, `integrations` (pm, git, linear_team, etc.), `defaults` (base_branch, branch_convention, default_reviewers), project `name`/`repo`/`base_branch`/`branch_convention`/`default_reviewers`/`issue_prefix` | Already stored in `Organization`, `IntegrationConfig`, `ProjectSettings`, `ProjectMembership` models |
| **Not stored — Claude discovers from repo** | `stack`, `build_cmd`, `test_cmd`, `e2e_test_cmd`, `lint_cmd`, `format_cmd`, `type_check_cmd`, `pre_push_checks`, `architecture_notes`, `coding_conventions` | Repo-intrinsic. Claude reads `CLAUDE.md`, `Makefile`, `package.json`, `pyproject.toml` naturally. Storing them in YAML creates maintenance burden and risks going stale |
| **Local overrides** (written manually to `local.yaml`) | `environments`, `deploy_cmd`, `docs_url`, `api_docs_url`, `feature_flags_system`, `slack_channel`, `teams_channel`, `oncall_doc`, `pr_template`, `auto_label_pr` | Can't be derived from backend or repo — operator writes these if needed |

## WebSocket Protocol

### New message: `config.sync` (backend -> runner)

Sent after `register`, before queued `task.assign` messages.

```json
{
  "type": "config.sync",
  "organizations": [
    {
      "id": "uuid",
      "name": "MyOrg",
      "slug": "myorg",
      "integrations": {
        "pm": "linear",
        "git": "github",
        "linear_team": "ENG"
      },
      "defaults": {
        "base_branch": "main",
        "branch_convention": "feat/{issue_prefix}-{issue_number}-{slug}",
        "default_reviewers": []
      },
      "projects": [
        {
          "id": "uuid",
          "name": "Backend API",
          "slug": "backend-api",
          "repository_url": "https://github.com/org/backend-api.git",
          "base_branch": "main",
          "branch_convention": "feat/ENG-{issue_number}-{slug}",
          "default_reviewers": ["senior-dev", "tech-lead"],
          "issue_prefix": "ENG"
        }
      ]
    }
  ]
}
```

### Enhanced `task.assign` (backend -> runner)

Tasks now include optional `project_id` so the runner resolves the correct `cwd`:

```json
{
  "type": "task.assign",
  "task_id": "uuid",
  "title": "Fix login bug",
  "prompt": "...",
  "project_id": "uuid"
}
```

The runner resolves `project_id` to `{workspace_root}/{org_slug}/projects/{project_slug}/` and sets it as Claude SDK's `cwd`. If `project_id` is null, falls back to the runner's configured `working_directory`.

## Generated Files

### `workspace-registry.yaml` (full overwrite on every connect)

```yaml
# MANAGED BY TOONY -- DO NOT EDIT
# Last synced: 2026-03-06T14:30:00Z

organization: "MyOrg"
organization_id: "uuid"

integrations:
  pm: linear
  git: github
  linear_team: "ENG"

defaults:
  base_branch: "main"
  branch_convention: "feat/{issue_prefix}-{issue_number}-{slug}"
  default_reviewers: []

projects:
  - name: "Backend API"
    id: "uuid"
    slug: "backend-api"
    repo: "https://github.com/org/backend-api.git"
    base_branch: "main"
    branch_convention: "feat/ENG-{issue_number}-{slug}"
    default_reviewers: ["senior-dev", "tech-lead"]
    issue_prefix: "ENG"
```

### `local.yaml` (optional, per-project, never touched by sync)

```yaml
# Local overrides for this project -- not synced to backend
environments:
  staging: "https://staging.company.com"
  production: "https://company.com"
deploy_cmd: "npm run deploy:staging"
slack_channel: "#backend-team"
```

## Sync Lifecycle

### On connect (automatic)

1. Runner sends `register` with host metadata
2. Backend responds with `config.sync` (all orgs + projects for this ToonyAgent)
3. Runner processes sync:
   - For each org: create `{workspace_root}/{org_slug}/.toony/` if missing
   - Create `{workspace_root}/{org_slug}/projects/{project_slug}/` directories (empty, no git clone)
   - Write `workspace-registry.yaml` (full overwrite)
   - Build in-memory `project_id -> local_path` mapping for task routing
4. Backend sends queued `task.assign` messages (after `config.sync`)
5. On reconnect: same flow, idempotent

### On demand (user-triggered)

1. User clicks "Sync Config" button on toony agent detail page in the frontend
2. Frontend sends `config.sync` message via the frontend-facing WebSocket (`ToonyAgentConsumer`)
3. Backend queries fresh org + project data and forwards `config.sync` to the runner via channel layer (`ToonyAgentRunnerConsumer`)
4. Runner processes sync (same logic as on connect)
5. Runner responds with `config.sync.ack` to confirm completion
6. Frontend receives `config.sync.status` with result

This allows the user to push config changes (new projects, updated settings, org changes) to a running agent without requiring a reconnect.

## Runner Config Addition

```yaml
# config.yml
workspace_root: "~/work"    # base directory for all org workspaces

backend_url: "ws://localhost:8000/ws/toony-agents/runner/"
api_key: "tok_ta_..."

claude:
  max_task_timeout: 3600
  # working_directory is now the fallback for tasks without project_id
  working_directory: "."
  ...
```

If multiple runners share the same machine, each must configure a different `workspace_root` to avoid conflicts.

## Backend Changes

### Consumer (`ToonyAgentRunnerConsumer`)

In the `register` handler, after setting status to ONLINE, query the agent's organizations with projects and send `config.sync` before dispatching queued tasks.

### Consumer (`ToonyAgentConsumer`)

Handle incoming `config.sync.request` message from the frontend. Query fresh org + project data for the agent, then forward `config.sync` to the runner via channel layer. Relay `config.sync.ack` back to frontend as `config.sync.status`.

### New selector

`get_agent_workspace_config(agent_id)` — joins `ToonyAgent -> Organization -> Project -> ProjectSettings` + `IntegrationConfig` and returns the nested structure for `config.sync`.

### AgentTask model

Add optional `project` FK to `AgentTask`:

```python
project = models.ForeignKey(
    "projects.Project",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="agent_tasks",
)
```

This allows tasks to be project-scoped. The `task.assign` message includes `project_id` when present.

### Protocol update

`task.assign` gains optional `project_id` field. Existing tasks without a project continue to work (runner falls back to `working_directory`).

## Runner Changes

### New module: `workspace.py`

Handles sync logic:
- `process_config_sync(data, workspace_root)` — creates dirs, writes YAML, returns project mapping
- `resolve_project_path(project_id, project_map)` — resolves project_id to local path

### Protocol additions (`protocol.py`)

- New `ConfigSync` incoming message type
- New `ConfigSyncAck` outgoing message type (runner -> backend, confirms sync completed)
- `TaskAssign` gains optional `project_id` field

### Main loop (`main.py`)

- Add `workspace_root` to `RunnerConfig`
- Handle `ConfigSync` message in main loop
- Maintain `project_map: dict[str, Path]` (project_id -> local path)
- `execute_task` resolves `project_id` to override `cwd` in SDK options

## Sequence Diagram

### On connect

```
Runner                          Backend                        Frontend
  |                                |                              |
  |--- register {metadata} ------>|                              |
  |                                |-- query agent orgs+projects  |
  |<-- config.sync {orgs[...]} ---|                              |
  |                                |                              |
  |-- create dirs, write YAML     |                              |
  |-- build project_id->path map  |                              |
  |--- config.sync.ack ---------> |                              |
  |                                |                              |
  |<-- task.assign {project_id} --|                              |
  |                                |                              |
  |-- resolve cwd from project_id |                              |
  |-- execute Claude SDK (cwd)    |                              |
  |--- task.event {data} -------->|                              |
  |--- task.completed ----------->|                              |
```

### On demand (user clicks "Sync Config")

```
Runner                          Backend                        Frontend
  |                                |                              |
  |                                |<-- config.sync.request ------|
  |                                |-- query agent orgs+projects  |
  |<-- config.sync {orgs[...]} ---|                              |
  |                                |                              |
  |-- create dirs, write YAML     |                              |
  |-- build project_id->path map  |                              |
  |--- config.sync.ack ---------> |                              |
  |                                |--- config.sync.status ------>|
```

## Frontend Changes

### Toony Agent Detail Page

Add a "Sync Config" button to the agent detail page. The button:
- Is visible when the agent is ONLINE or BUSY
- Sends `config.sync.request` via the existing `useAgentWebSocket` hook
- Shows loading state while waiting for `config.sync.status` response
- Displays success/error feedback

### New WebSocket messages (frontend)

| Direction | Type | Purpose |
|-----------|------|---------|
| Out | `config.sync.request` | User triggers config sync |
| In | `config.sync.status` | Backend confirms sync completed (with success/error) |

## File Reference & Manual Setup

All config files can be auto-generated via `config.sync`, but they can also be created and maintained manually. This section documents each file's schema and provides example templates.

### File: `config.yml` (runner config)

**Location:** passed via `--config` CLI flag (e.g., `toony-agent-runner --config config.yml`)

Controls the runner daemon itself: backend connection, Claude SDK settings, and workspace root.

```yaml
# Toony Agent Runner - Configuration
# Copy to config.yml and fill in your values.

# Backend WebSocket URL
backend_url: "ws://localhost:8000/ws/toony-agents/runner/"

# API key generated in Toony web UI (Toony Agent > Keys)
api_key: "tok_ta_..."

# Base directory for all org workspaces.
# Each organization gets a subdirectory: {workspace_root}/{org_slug}/
# If multiple runners share the same machine, use different workspace_root values.
workspace_root: "~/work"

claude:
  # Fallback working directory for tasks without a project_id.
  # When a task has project_id, the runner resolves it to
  # {workspace_root}/{org_slug}/projects/{project_slug}/ instead.
  working_directory: "."

  # Maximum time (seconds) a task can run before being killed.
  max_task_timeout: 3600

  # Maximum time (seconds) to wait for user approval on AskUserQuestion.
  approval_timeout: 600

  # How many tasks can run concurrently. Tasks beyond capacity stay QUEUED.
  max_concurrent_tasks: 1

  # OAuth token for Claude MAX plan. Can also set CLAUDE_CODE_OAUTH_TOKEN env var.
  # oauth_token: ""

  # Claude permission mode: acceptEdits | plan | bypassPermissions
  permission_mode: "acceptEdits"

  # Tools Claude is allowed to use. AskUserQuestion is handled via hooks, not here.
  allowed_tools:
    - Read
    - Edit
    - Write
    - Bash
    - Grep
    - Glob
    - WebFetch
    - WebSearch
    - NotebookEdit

reconnect:
  # -1 = unlimited retries
  max_retries: -1
  backoff_base: 1.0
  backoff_max: 30.0
```

### File: `workspace-registry.yaml` (per-organization)

**Location:** `{workspace_root}/{org_slug}/.toony/workspace-registry.yaml`

**Managed by:** auto-generated by `config.sync` (full overwrite). Can also be written manually.

Contains all backend-synced data for one organization: identity, integrations, defaults, and project list.

```yaml
# Toony - Workspace Registry
# Location: {workspace_root}/{org_slug}/.toony/workspace-registry.yaml
#
# This file is auto-generated by config.sync and overwritten on every sync.
# To configure manually, fill in the values below.
# When managed by sync, do not edit -- changes will be lost.

# Organization identity
organization: "MyStartup"
organization_id: "550e8400-e29b-41d4-a716-446655440000"

# Integrations configured for this organization
integrations:
  # Project management tool: linear | jira | github-issues | gitlab-issues
  pm: linear

  # Git provider: github | gitlab | bitbucket
  git: github

  # Linear (required if pm: linear)
  linear_team: "ENG"

  # Jira (required if pm: jira)
  # jira_url: "https://company.atlassian.net"
  # jira_project_key: "PROJ"

  # GitLab (required if git: gitlab)
  # gitlab_url: "https://gitlab.com"
  # gitlab_group: "company"

  # Bitbucket (required if git: bitbucket)
  # bitbucket_workspace: "company"

# Organization-wide defaults (can be overridden per project)
defaults:
  base_branch: "main"
  branch_convention: "feat/{issue_prefix}-{issue_number}-{slug}"
  default_reviewers: []

# Projects belonging to this organization
projects:
  - name: "Backend API"
    id: "660e8400-e29b-41d4-a716-446655440001"
    slug: "backend-api"
    repo: "https://github.com/mystartup/backend-api.git"
    base_branch: "main"
    branch_convention: "feat/ENG-{issue_number}-{slug}"
    default_reviewers: ["senior-dev", "tech-lead"]
    issue_prefix: "ENG"

  - name: "Frontend App"
    id: "660e8400-e29b-41d4-a716-446655440002"
    slug: "frontend-app"
    repo: "https://github.com/mystartup/frontend-app.git"
    base_branch: "develop"
    branch_convention: "feat/FE-{issue_number}-{slug}"
    default_reviewers: []
    issue_prefix: "FE"
```

### File: `local.yaml` (per-project)

**Location:** `{workspace_root}/{org_slug}/projects/{project_slug}/.toony/local.yaml`

**Managed by:** the operator, manually. Never touched by `config.sync`.

Contains local overrides that can't be derived from the backend or discovered by Claude from the repo. All fields are optional.

```yaml
# Toony - Project Local Overrides
# Location: {workspace_root}/{org_slug}/projects/{project_slug}/.toony/local.yaml
#
# This file is NOT managed by config.sync. Edit freely.
# All fields are optional -- only add what you need.

# Deployment environments
# environments:
#   staging: "https://staging.company.com"
#   production: "https://company.com"

# Deploy command (run from project root)
# deploy_cmd: "npm run deploy:staging"

# Documentation URLs
# docs_url: "https://notion.so/company/backend-docs"
# api_docs_url: "https://api.company.com/docs"

# Feature flag system
# feature_flags_system: "LaunchDarkly"

# Communication channels
# slack_channel: "#backend-team"
# teams_channel: "Backend Dev"

# On-call documentation (path relative to project root)
# oncall_doc: "docs/ONCALL.md"

# PR configuration (overrides workspace-registry defaults)
# pr_template: ".github/PULL_REQUEST_TEMPLATE.md"
# auto_label_pr: ["needs-review", "backend"]
```

## Out of Scope

- **Repo cloning**: repos are not auto-cloned. Cloning is handled separately via the existing `git_clone` command or manually by the operator.
- **`local.yaml` schema validation**: no enforcement for now; free-form YAML.
