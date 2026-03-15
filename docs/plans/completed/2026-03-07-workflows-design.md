# Workflows Design

**Date:** 2026-03-07
**Status:** Approved

## Overview

Workflows are DAGs (Directed Acyclic Graphs) of SubAgents and Skills that define execution pipelines. They are configured via a visual drag & drop editor in the UI, stored in the backend, and obtained on-demand by a preconfgured "Workflow Executor" subagent in Claude Code via an MCP tool.

## Key Decisions

- **DAG execution model** — Nodes execute respecting dependencies; independent nodes run in parallel.
- **No execution inside Toony** — Workflows are definitions only. Execution happens in Claude Code via the Workflow Executor subagent.
- **No file export** — Workflows are NOT exported as YAML files by the runner. The Workflow Executor calls an MCP tool to get the workflow YAML on-demand from the backend.
- **Scoping with inheritance** — Workflows can be scoped to global, organization, project, or issue. Resolution follows a priority chain (Issue > Project > Org > Global).
- **Label-based matching** — Each workflow optionally requires a label. Resolution matches issue labels in order. Workflows with null label serve as defaults.
- **Active/Inactive toggle** — No full lifecycle states (no DRAFT/DEPRECATED). Simple on/off.
- **No versioning** — Workflows are edited in-place.
- **Node config overrides** — Each node uses its SubAgent/Skill base config but allows optional overrides per node.
- **YAML references only** — The YAML returned by the MCP tool contains slugs, not full SubAgent/Skill content. The executor invokes them by name since they are already exported.

## Data Model

### Workflow

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | BaseModel PK |
| name | str | Required |
| slug | str | Unique within scope |
| description | text | Nullable |
| is_active | bool | Default True |
| organization | FK(Organization) | Nullable — scope |
| project | FK(Project) | Nullable — scope |
| issue | FK(Issue) | Nullable — scope |
| label | FK(Label) | Nullable — null = default workflow |
| created_by | FK(User) | Required |

**Scope resolution:** If all scope FKs are null → global. Otherwise, the most specific non-null FK defines the scope.

### WorkflowNode

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | BaseModel PK |
| workflow | FK(Workflow) | Cascade delete |
| type | enum | SUBAGENT, SKILL |
| sub_agent | FK(SubAgent) | Nullable — set when type=SUBAGENT |
| skill | FK(Skill) | Nullable — set when type=SKILL |
| position_x | float | Canvas X coordinate |
| position_y | float | Canvas Y coordinate |
| config_overrides | JSON | Default {} |
| order | int | Deterministic serialization order |

**Constraints:**
- Unique (workflow, sub_agent) when sub_agent is not null
- Unique (workflow, skill) when skill is not null

### WorkflowEdge

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | BaseModel PK |
| workflow | FK(Workflow) | Cascade delete |
| source_node | FK(WorkflowNode) | Cascade delete |
| target_node | FK(WorkflowNode) | Cascade delete |

**Constraints:**
- Unique (source_node, target_node)
- Both nodes must belong to the same workflow (validated in service layer)
- No cycles (validated in service layer via topological sort)

## Workflow Resolution Algorithm

Given an issue with ordered labels [L1, L2, ...]:

```
function resolve_workflow(issue):
    scopes = [issue, issue.project, issue.project.organization, null]  # null = global

    # Pass 1: Match by label
    for label in issue.labels (ordered):
        for scope in scopes:
            workflow = find_active_workflow(scope, label)
            if workflow:
                return workflow

    # Pass 2: Default (no label)
    for scope in scopes:
        workflow = find_active_workflow(scope, label=null)
        if workflow:
            return workflow

    return null  # No workflow applicable
```

## MCP Tool

### get_issue_workflow

**Input:** `issue_id` (UUID)

**Output:** YAML string with the resolved workflow, or null if none applies.

```yaml
name: "Bug Fix Pipeline"
slug: "bug-fix-pipeline"
description: "Pipeline para corregir bugs"
nodes:
  - id: "lint"
    type: skill
    slug: "code-linter"
  - id: "fixer"
    type: subagent
    slug: "bug-fixer"
    config_overrides:
      strict: true
    depends_on: [lint]
  - id: "tester"
    type: subagent
    slug: "test-runner"
    depends_on: [lint]
  - id: "reviewer"
    type: subagent
    slug: "code-reviewer"
    depends_on: [fixer, tester]
```

The `depends_on` list is derived from WorkflowEdge records. Nodes without dependencies have no `depends_on` field (they are entry points).

## Node Availability by Scope

SubAgents/Skills available for a workflow depend on the workflow's scope:

| Workflow Scope | Available SubAgents/Skills |
|----------------|--------------------------|
| Global | Global only |
| Organization | Global + same org |
| Project | Global + same org + same project |
| Issue | Global + same org + same project |

## API Endpoints

```
GET/POST   /api/workflows/                      — List, Create
GET/PATCH/DELETE /api/workflows/{id}/            — Detail, Update, Delete
GET/POST   /api/workflows/{id}/nodes/            — List, Create nodes
PATCH/DELETE /api/workflows/{id}/nodes/{nid}/    — Update, Delete node
GET/POST   /api/workflows/{id}/edges/            — List, Create edges
DELETE     /api/workflows/{id}/edges/{eid}/      — Delete edge
GET        /api/workflows/resolve/{issue_id}/    — Resolve workflow for issue (returns YAML)
```

## Backend Architecture

Follows the existing layered pattern in the `agents` Django app (or a new `workflows` app — TBD):

- **models/** — Workflow, WorkflowNode, WorkflowEdge
- **selectors/** — `resolve_workflow_for_issue()`, list/detail queries with select_related/prefetch_related
- **services/** — CRUD + DAG validation (cycle detection via topological sort)
- **serializers/input.py** — Plain Serializer for validation
- **serializers/output.py** — ModelSerializer (read-only) + YAML serializer for resolve endpoint
- **views/** — Thin APIView subclasses
- **permissions.py** — Scope-based access control

## Frontend

### Navigation

New "Workflows" item in the AI Studio section of the sidebar (alongside SubAgents, Skills, Toony Agents).

### List Page (`/workflows`)

Cards displaying:
- Workflow name
- Scope badge (Global / Org name / Project name / Issue identifier)
- Label badge (or "Default" if no label)
- Active/Inactive toggle
- Node count

### Editor Page (`/workflows/new`, `/workflows/[id]/edit`)

Visual DAG editor with three panels:

- **Left panel:** Catalog of available SubAgents and Skills, filtered by workflow scope. Drag items onto the canvas.
- **Center canvas:** Drag & drop nodes, draw arrows between them to define dependencies. Real-time validation (cycles, disconnected nodes).
- **Right panel:** Properties of selected node (type, slug, config overrides) or workflow properties if nothing selected (name, description, scope, label, active toggle).

## Workflow Executor SubAgent

A preconfgured SubAgent in Claude Code that:

1. Receives an issue_id as input
2. Calls `get_issue_workflow` MCP tool
3. Parses the YAML response in memory
4. Resolves execution order via topological sort
5. Executes nodes respecting dependencies and parallelism
6. Invokes each skill/subagent by its slug (already exported by the runner)

## Runner Changes

No changes to the `toony_agent_runner` for workflows. The existing `config.sync` continues exporting Skills and SubAgents. Workflows are obtained on-demand via MCP by the Workflow Executor.
