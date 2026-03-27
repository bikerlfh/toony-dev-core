# File Mention Autocomplete in Textarea Fields

**Date:** 2026-03-26
**Status:** Implemented

## Overview

Add "@" file mention autocomplete to textarea fields across the app. When a user types "@" in a description, comment, or other long text field, a dropdown overlay shows files from the project's Git repository, filtered as the user types. Selecting a file inserts a plain text reference like `@src/components/Button.tsx`.

## Architecture

### Approach: Backend-cached file tree + textarea overlay

The toony_agent_runner already clones the project repository. It sends the file tree to the backend via WebSocket, which stores it in a dedicated model cached with django-cacheops. The frontend fetches the tree via REST and uses it to power an inline autocomplete overlay on textareas.

## Backend

### New model: `ProjectFileTree`

Location: `apps/projects/models/`

```python
class ProjectFileTree(BaseModel):
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="file_tree")
    tree = models.JSONField(default=list)  # flat list of relative paths
    branch = models.CharField(max_length=255, blank=True, default="")
    synced_at = models.DateTimeField()
```

- `tree` is a flat list of relative file paths (e.g., `["src/app.tsx", "src/lib/api.ts"]`), not a nested structure.
- OneToOne with Project — last sync wins.

### django-cacheops

Install `django-cacheops` and configure it with the existing Redis instance:

```python
CACHEOPS_REDIS = REDIS_URL  # already in infra

CACHEOPS = {
    "projects.ProjectFileTree": {"ops": "get", "timeout": 60 * 30},  # 30 min cache
}
```

Cache is automatically invalidated on model save/delete.

### New endpoint

`GET /api/projects/<project_id>/file-tree/`

- Selector queries `ProjectFileTree` for the project (cacheops-backed).
- Returns `{ tree: [...], branch: "main", synced_at: "..." }`.
- Returns `{ tree: [], branch: "", synced_at: null }` if no tree exists yet.

### WebSocket: new message type

Handler in the runner consumer for `file_tree.sync`:

```json
{
    "type": "file_tree.sync",
    "data": {
        "project_id": "uuid",
        "branch": "main",
        "tree": ["src/app.tsx", "src/lib/api.ts", "README.md"]
    }
}
```

Backend upserts `ProjectFileTree` on receive (update_or_create by project).

## Runner

### Sync triggers

1. **On WebSocket connect** — after handshake/registration, scan the cloned repo directory and send `file_tree.sync`.
2. **On task completion (`task.completed`)** — only if files were created or deleted. The runner captures a snapshot of file paths before task execution and compares after. If different, sends `file_tree.sync`.

No sync on `task.failed`.

### Tree generation

`collect_file_tree()` in `workspace.py` walks the cloned repo directory and returns a sorted list of relative paths. Denylist: `.git`, `node_modules`, `__pycache__`, `.venv`, `venv`, `dist`, `build`, `.next`, `.cache`, `coverage`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache`, `.tox`, `egg-info`, `.eggs`, `target`.

### Change detection

Before task execution: `snapshot_before = set(walk_tree())`.
After task completion: `snapshot_after = set(walk_tree())`.
If `snapshot_before != snapshot_after`: send `file_tree.sync`.

## Frontend

### New component: `FileAutoComplete`

A reusable component that wraps a `<textarea>` and adds "@" mention autocomplete.

#### Props

```tsx
interface FileAutoCompleteProps {
    projectId: string | null;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    className?: string;
    onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}
```

When `projectId` is `null`, behaves as a plain textarea.

#### Behavior

1. User types `@` → dropdown overlay appears below the text cursor.
2. Typing after `@` filters the file list using fuzzy path-segment matching.
3. Keyboard navigation: `Arrow Up`/`Arrow Down` to move, `Enter`/`Tab` to select, `Escape` to dismiss.
4. On selection: inserts `@path/to/file.tsx` into the textarea, closes dropdown.
5. Dismissal: dropdown closes on `Escape`, clicking outside, erasing the `@`, or typing a space without selecting.

#### Fuzzy path-segment filtering

Filtering logic extracted to `lib/fuzzy-path-filter.ts` (with tests in `lib/fuzzy-path-filter.test.ts`). Two-pass strategy:

1. **Substring match** (fast path): if the query is a substring of the path, it matches.
2. **Segment match**: splits the query by `/` and checks that each segment appears in order within the path segments. This allows skipping intermediate directories — e.g., `frontend/artifacts` matches `frontend/app/(dashboard)/artifacts/page.tsx`.

#### Dropdown sizing

The dropdown uses `w-max max-w-lg` so it auto-sizes to fit the longest visible path, capped at 512px to prevent overflow.

#### Cursor positioning

Use a hidden mirror `<div>` with matching font/size to calculate the `@` character's position within the textarea and position the dropdown accordingly.

#### Data loading

- On mount (when `projectId` is available): `GET /api/projects/<projectId>/file-tree/`.
- Tree stored in component local state.
- If no tree available, `@` simply does nothing.
- Re-fetches when `projectId` changes (e.g., switching projects in QuickCreateIssueModal).

### Where it's used

Replace the textarea with `<FileAutoComplete>` in:
- `CreateIssueModal` (description)
- `QuickCreateIssueModal` (description)
- Issue detail page (description edit mode + comments)
- `IssueSidePanel` (description)
- Any future long text field that receives a `projectId`

## Edge cases

- **No runner connected:** No `ProjectFileTree` exists → endpoint returns empty tree → `@` doesn't trigger dropdown.
- **Large repos (>10k files):** Flat list filtering in JS is fast over strings. Not a concern for MVP.
- **Multiple runners for same project:** Last sync wins (OneToOne upsert).
- **Project switch in QuickCreateIssueModal:** Tree re-fetched for the new project.

## What this design does NOT include

- Rich rendering of mentions (no chips, no links — plain text only).
- Validation that referenced files exist at save time.
- File content preview.
- Nested tree UI (files shown as flat paths in dropdown).
