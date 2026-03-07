---
name: toony-mcp
description: "Use when the user wants to interact with Toony (project management) via MCP tools. Examples: check issues, update status, search projects, create comments or artifacts."
---

# Toony MCP — Common Patterns

Use the `mcp__toony__*` tools to interact with Toony as a project management system.

## Issue Lookup

- **`get_issue`** accepts both UUID and identifier (e.g., `ENG-42`). Returns the full issue with comments, activities, artifacts, and documents in one call — no need to call separate endpoints.
- **`get_my_issues`** returns all issues assigned to the authenticated user across all projects. Supports filtering by `status`, `priority`, and `search`.

## Finding Projects & Context

- **`list_projects`** with `search` to find a project by name.
- **`get_project`** for full project detail (includes `organization` object with `id`).
- **`search_global`** requires `organization_id` — get it first from `get_project` → `response.organization.id`.

## Updating Issues

- Pass `"none"` as a string to unset fields in `update_issue` (e.g., `assignee_id: "none"`, `milestone_id: "none"`, `due_date: "none"`).
- `label_ids` is a **comma-separated string**, not an array (e.g., `"uuid1,uuid2"`).
- `update_issue` requires both `issue_id` (UUID) and `project_id` (UUID).

## Creating Artifacts

- Use **`create_artifact`** to publish plans, design docs, specs, or test plans attached to an issue.
- `artifact_type` values: `PLAN`, `DESIGN_DOC`, `TECHNICAL_SPEC`, `TEST_PLAN`, `OTHER`.
- Content supports markdown.

## Documents

- Documents returned by `get_issue` include a `file_url` field with the absolute URL for direct download.

## Enum Reference

- **Status:** `BACKLOG`, `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELED`
- **Priority:** `NONE`, `URGENT`, `HIGH`, `MEDIUM`, `LOW`
- **Artifact type:** `PLAN`, `DESIGN_DOC`, `TECHNICAL_SPEC`, `TEST_PLAN`, `OTHER`
