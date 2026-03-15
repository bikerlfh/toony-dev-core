# Design: Rename `issue_prefix_override` → `issue_prefix` (required)

**Date:** 2026-03-06
**Status:** Approved

## Summary

Rename `ProjectSettings.issue_prefix_override` to `issue_prefix`, make it required at project creation, and simplify issue identifier generation to always use `{issue_prefix}-{sequential_number}`.

## Changes

### Backend

**Model `ProjectSettings`** — Rename field `issue_prefix_override` → `issue_prefix`. Remove `blank=True, default=""`. Migration: `RenameField` + `AlterField`.

**Input serializer `CreateProjectSerializer`** — Add `issue_prefix` (required, max_length=10).

**Input serializer `UpdateProjectSettingsSerializer`** — Rename field, disallow blank.

**Output serializer `ProjectSettingsSerializer`** — Rename field.

**Service `create_project()`** — Extract `issue_prefix` from kwargs, pass to `ProjectSettings.objects.create(project=project, issue_prefix=issue_prefix)`.

**Service `update_project_settings()`** — Rename in `allowed_fields`.

**Selector `get_next_identifier()`** — Simplify: read `project.settings.issue_prefix` directly. Remove all fallback logic (teams, slug).

**Selector `workspace_config_selector`** — Update `settings.issue_prefix_override` → `settings.issue_prefix`.

### Frontend

**`types/projects.ts`** — Rename `issue_prefix_override` → `issue_prefix`.

**`projects/new/page.tsx`** — Add required `issue_prefix` field to form. Send in `createProject` payload.

**`projects/[id]/page.tsx`** — Update Settings tab to read/write `issue_prefix`.

### Migration

Single migration: `RenameField` + `AlterField` to remove blank/default.
