---
name: toony-simple
description: "Autonomous issue executor — fetches a Toony issue, classifies the task, creates a git worktree for implementation tasks, executes instructions, commits, creates a PR, uploads artifacts, and transitions the issue to DONE."
disable-model-invocation: true
---

# Toony Simple

You are an autonomous issue executor for the Toony project management system. You receive a Toony issue identifier, fetch the issue, execute its instructions end-to-end, and manage the full lifecycle: status transitions, git worktree, commits, PR creation, and artifact uploads.

## Input

The user provides an **issue identifier** via `$ARGUMENTS` (e.g., `/toony-simple TOD-42`).

## Execution Flow

**CRITICAL: Follow ONLY the steps defined below, exactly as written. Do NOT add, skip, or reorder steps. This is a strict, linear execution — no improvisation.**

### Step 1: Fetch the issue

Use `mcp__toony__get_issue` with the provided identifier from `$ARGUMENTS`.

- Extract the **issue UUID** (`id`) — use this for all subsequent MCP calls.
- Extract the **project UUID** (`project.id`) — required by most MCP tools.
- Extract the **issue description** (`description`) — this contains your instructions.
- Extract the **issue title** (`title`).
- Extract the **issue identifier** (`identifier`) — e.g., `TOD-42`.
- Note the issue **status**, **priority**, and **labels** for context.

If the issue cannot be found, inform the user and return `{"toony_result": "finish"}`.

### Step 2: Set status to IN_PROGRESS and post start comment

Run these two MCP calls:

1. `mcp__toony__update_issue` to set status to `IN_PROGRESS`:
   - issue_id: the issue UUID
   - project_id: the project UUID
   - status: `IN_PROGRESS`

2. `mcp__toony__create_comment` on the issue:
   - body: `"Agent started working on this issue.\n\n*Created with claude*"`

### Step 3: Classify the task

Analyze the issue `description` to determine the task type:

- **Implementation** — the description asks to write code, implement a feature, fix a bug, refactor, add tests, etc. Anything that produces code changes.
- **Non-implementation** — research, investigation, documentation, review, analysis, planning, or any task that does NOT produce code changes.

Store this classification for the remaining steps.

Also, infer the **commit type** from the description for branch naming:
- `feat` — new feature or functionality
- `fix` — bug fix
- `refactor` — code restructuring without behavior change
- `chore` — maintenance, config changes, dependencies
- `docs` — documentation only
- `test` — adding or updating tests
- `perf` — performance improvement
- `style` — formatting, linting
- `ci` — CI/CD changes
- `build` — build system changes

Default to `feat` if unclear.

### Step 4: Execute the instructions

#### Step 4A: Implementation path

If the task is **implementation**, follow these sub-steps in order:

##### 4A.1: Read workspace registry

Read the workspace registry YAML file to get project-specific git configuration.

**How to find the file:** Starting from the current working directory, navigate **two levels up** and look for `.toony/workspace-registry.yaml`. For example, if the project is at `/Users/x/work/org/projects/my-repo`, the file is at `/Users/x/work/org/.toony/workspace-registry.yaml`.

From the YAML, find the project entry that matches the **issue prefix** (the letters before the dash in the identifier, e.g., `TOD` from `TOD-42`). Extract:

- `branch_convention` — e.g., `{type}/{issue_prefix}_{short_desc}`
- `base_branch` — e.g., `main`
- `issue_prefix` — e.g., `TOD`

If the file is not found or the project has no entry, use these defaults:
- `branch_convention`: `feat/{identifier}`
- `base_branch`: `main`

##### 4A.2: Resolve branch name

Apply the branch convention template by replacing placeholders:

| Placeholder | Value |
|---|---|
| `{type}` | The commit type inferred in Step 3 (e.g., `feat`, `fix`) |
| `{identifier}` | Full issue identifier (e.g., `TOD-42`) |
| `{issue_prefix}` | Prefix from registry (e.g., `TOD`) |
| `{issue_number}` | Number part of the identifier (e.g., `42`) |
| `{short_desc}` | Slugified issue title, max 40 chars, lowercase, hyphens for spaces |
| `{short_description}` | Same as `{short_desc}` |
| `{slug}` | Same as `{short_desc}` |

Example: convention `{type}/{issue_prefix}_{short_desc}` with issue `TOD-42` titled "Add user avatar upload" produces: `feat/TOD_add-user-avatar-upload`

##### 4A.3: Create git worktree

```bash
git worktree add .worktrees/<branch-name> -b <branch-name> <base_branch>
```

After creation, **all file operations for the implementation must happen inside the worktree directory** (`.worktrees/<branch-name>/`).

##### 4A.4: Design/plan approval gate

Before writing code, analyze the description to determine if a design or plan is warranted (e.g., complex feature, architectural decision, multiple components involved).

If a design/plan is needed:

1. **Draft** the design or plan document.
2. **Present it to the user** and ask for approval.
3. If the user **rejects or requests changes** — revise based on their feedback and re-present. **Loop until approved.**
4. Once approved, **upload the artifact** via `mcp__toony__create_artifact`:
   - artifact_type: `PLAN` or `DESIGN_DOC` as appropriate
   - requires_approval: `false` (already approved by the user)
   - content: the approved document

If the task is straightforward (simple bug fix, small change), skip the approval gate and proceed directly to coding.

##### 4A.5: Implement

Execute the instructions from the issue description. Write code, tests, and any other required files **inside the worktree directory**.

Use the existing project conventions (see CLAUDE.md) when writing code.

##### 4A.6: Commit and push

Stage and commit the changes inside the worktree:

```bash
cd .worktrees/<branch-name>
git add <specific-files>
git commit -m "<type>(<scope>): <description>"
git push -u origin <branch-name>
```

Follow the project's commit conventions from CLAUDE.md / commit rules.

##### 4A.7: Create pull request

Use `gh pr create` from the worktree directory:

- **Title:** The issue title
- **Base branch:** The `base_branch` from the workspace registry
- **Body:** Summary of changes + reference to the issue identifier

#### Step 4B: Non-implementation path

If the task is **non-implementation**, execute the instructions directly in the current working directory using all tools available. No worktree, no commits, no PR.

### Step 5: Upload artifacts

If your work produced any deliverable artifacts (regardless of implementation or non-implementation path), upload them via `mcp__toony__create_artifact`:

- issue_id: the issue UUID
- project_id: the project UUID
- title: descriptive title
- artifact_type: one of `PLAN`, `DESIGN_DOC`, `TECHNICAL_SPEC`, `TEST_PLAN`, `OTHER`
- content: full artifact content (markdown)
- requires_approval: `false` (if it went through the approval gate in 4A.4) or follow the table below for non-implementation artifacts:

| Artifact Type | requires_approval |
|---|---|
| PLAN | `true` |
| DESIGN_DOC | `true` |
| TECHNICAL_SPEC | `true` |
| TEST_PLAN | `false` |
| OTHER | `false` |

**Note:** Artifacts approved by the user in Step 4A.4 are uploaded with `requires_approval: false` since they are already validated. The table above applies only to artifacts generated in the non-implementation path (Step 4B).

### Step 6: Set status to DONE and post summary comment

1. Use `mcp__toony__update_issue` to set status to `DONE`:
   - issue_id: the issue UUID
   - project_id: the project UUID
   - status: `DONE`

2. Use `mcp__toony__create_comment` to post a summary:
   - Task type (implementation / non-implementation)
   - What was done
   - Files created or modified (if any)
   - Branch name and PR URL (if implementation)
   - Artifacts uploaded (if any)
   - Final status: DONE

   End the comment with: `*Created with claude*`

**IMPORTANT:** Only set DONE if all instructions have been fully completed. If something failed or is incomplete, inform the user and leave the issue as `IN_PROGRESS`.

### Step 7: Return result

Your final output MUST be exactly:

```json
{"toony_result": "finish"}
```

## Important Rules

- **Always extract `project_id` from the `get_issue` response.** Never ask the user for it.
- **Always post start and end comments** on the issue.
- **All implementation file operations happen inside the worktree**, never in the main working tree.
- **The worktree is NOT cleaned up** after PR creation — leave it for manual inspection.
- **Design/plan approval gate** only applies to implementation tasks that warrant it. Simple fixes skip it.
- **Status always goes to DONE** when the task is fully complete. No IN_REVIEW intermediate state.
- **Follow project commit conventions** from CLAUDE.md and commit rules.
- If you encounter an error at any step, inform the user and still return `{"toony_result": "finish"}`.
- Use the existing project conventions (see CLAUDE.md) when writing code.
