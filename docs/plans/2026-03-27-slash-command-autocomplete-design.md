# Slash Command Autocomplete for Skills

**Date:** 2026-03-27
**Status:** Approved

## Overview

Add "/" slash command autocomplete to the existing mention autocomplete component. When a user types "/" in a description, comment, or other long text field, a dropdown shows available Claude skills (user-level and project-level) from the project's cloned repo. Selecting a skill inserts a plain text reference like `/brainstorming`.

## Backend

### Extend `ProjectFileTree` model

Add a `skills` JSONField to the existing model:

```python
skills = models.JSONField(default=list)
# Format: [{"name": "brainstorming", "description": "Help turn ideas into designs"}, ...]
```

The existing endpoint `GET /api/projects/<project_id>/file-tree/` now also returns `skills` alongside `tree`, `branch`, and `synced_at`.

The WebSocket handler for `file_tree.sync` already does `update_or_create` with `defaults` — just include `skills` in the defaults.

### Migration

Add `skills` field with `default=list` to `ProjectFileTree`. Non-breaking — existing rows get `[]`.

## Runner

### Skill collection

On `file_tree.sync`, the runner also scans for skills:

- **Project-level:** `{repo_dir}/.claude/skills/*/` — each subdirectory with a skill definition
- **User-level:** `~/.claude/skills/*/` — user's global skills

For each skill directory, extract `name` (directory name) and `description` (first line of the skill.md or similar file after any frontmatter).

### Message format

The existing `file_tree.sync` message gains a `skills` field:

```json
{
    "type": "file_tree.sync",
    "project_id": "uuid",
    "branch": "main",
    "tree": ["src/app.tsx", "..."],
    "skills": [
        {"name": "brainstorming", "description": "Help turn ideas into designs"},
        {"name": "writing-plans", "description": "Write implementation plans"}
    ]
}
```

## Frontend

### Rename `FileAutoComplete` → `MentionAutoComplete`

The component now handles two triggers:

- `@` → shows file paths from `tree` (existing behavior)
- `/` → shows skills from `skills`

### Behavior for "/"

1. User types `/` (at start of line or after whitespace) → dropdown appears with skills
2. Typing after `/` filters skills by name (substring match)
3. Keyboard navigation: same as `@` (arrows, Enter/Tab, Escape)
4. On selection: inserts `/skill-name` into textarea
5. Dropdown items show: skill icon + **name** — description

### Data loading

Same endpoint, same fetch. The component already fetches `/api/projects/<id>/file-tree/` on mount. Now it also reads `skills` from the response.

## Edge cases

- **No skills found:** `/` doesn't trigger dropdown (same as `@` with empty tree)
- **Skills change:** Updated on next `file_tree.sync` (runner connect or task completion with file changes)
- **Both `@` and `/` in same textarea:** Each trigger is independent, only one dropdown active at a time
