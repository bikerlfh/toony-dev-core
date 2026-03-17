# Toony Orchestrator Agent — Design

**Date:** 2026-03-16
**Status:** Approved

## Overview

Two Claude Code agents that receive a Toony issue identifier, fetch issue data via MCP, execute the instructions in the issue description, manage status transitions, and upload artifacts.

- **v1 (`toony-orchestrator`):** Simple — executes directly from `issue.description`.
- **v2 (`toony-orchestrator-wf`):** With workflow — resolves a workflow DAG via `get_issue_workflow` and follows it; falls back to v1 behavior if no workflow exists.

Both agents are **manual-only** (not auto-invocable).

## Flow

```
User invokes with issue identifier (e.g., "ENG-42")
    │
    ▼
1. get_issue(identifier) → extract issue data + project_id
    │
    ▼
2. [v2 only] get_issue_workflow(issue_id)
   ├── Workflow found → parse YAML DAG, execute nodes in dependency order
   └── No workflow → fall back to description-based execution
    │
    ▼
3. create_comment → "Agent started working on this issue"
   update_issue → status: IN_PROGRESS
    │
    ▼
4. Execute instructions from issue.description (or workflow DAG)
    │
    ▼
5. If artifacts created:
   a. Present to user
   b. create_artifact with type + requires_approval flag
      - PLAN / DESIGN_DOC / TECHNICAL_SPEC → requires_approval: true
      - TEST_PLAN / OTHER → requires_approval: false
    │
    ▼
6. Determine final status:
   - Has artifact with requires_approval: true → IN_REVIEW
   - Otherwise → DONE
   update_issue → final status
    │
    ▼
7. create_comment → summary of work + "Created with claude"
    │
    ▼
8. Return {"toony_result": "finish"}
```

## Agent Configuration

| Aspect | Detail |
|--------|--------|
| **Location** | `.claude/agents/toony-orchestrator.md` and `.claude/agents/toony-orchestrator-wf.md` |
| **Tools** | All (Read, Write, Edit, Bash, Glob, Grep, Agent, WebFetch, WebSearch) |
| **MCP** | Inherited from conversation (toony MCP) |
| **Auto-invocable** | No — description explicitly says "invoke explicitly" |
| **Model** | Inherit from parent |
| **Input** | Single issue identifier (e.g., `ENG-42` or UUID) |
| **project_id** | Auto-extracted from `get_issue` response |

## Artifact Rules

| Artifact Type | requires_approval | Issue Final Status |
|---------------|-------------------|--------------------|
| PLAN | true | IN_REVIEW |
| DESIGN_DOC | true | IN_REVIEW |
| TECHNICAL_SPEC | true | IN_REVIEW |
| TEST_PLAN | false | DONE |
| OTHER | false | DONE |

## Comments

- **On start:** "Agent started working on this issue" — signed "Created with claude"
- **On finish:** Summary of actions taken (files changed, artifacts created, etc.) — signed "Created with claude"

## MCP Tools Used

- `get_issue` — fetch issue data + project context
- `update_issue` — status transitions (IN_PROGRESS → DONE / IN_REVIEW)
- `create_artifact` — upload plans, designs, specs
- `create_comment` — start/end comments
- `get_issue_workflow` — (v2 only) resolve workflow DAG

## Enum Reference

- **Status:** BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED
- **Artifact type:** PLAN, DESIGN_DOC, TECHNICAL_SPEC, TEST_PLAN, OTHER
