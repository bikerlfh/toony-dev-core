# File Mention Autocomplete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "@" file mention autocomplete to textareas across the app, powered by a cached file tree synced from the toony_agent_runner.

**Architecture:** The runner sends the project's file tree to the backend via WebSocket on connect and after task completion (if files changed). Backend stores it in a `ProjectFileTree` model cached with django-cacheops. Frontend fetches the tree via REST and uses it to power a textarea overlay autocomplete triggered by "@".

**Tech Stack:** Django 5 / DRF, django-cacheops, Redis, Django Channels WebSocket, Next.js 15 / React 19, TypeScript, Tailwind CSS v4.

**Design doc:** `docs/plans/2026-03-26-file-mention-autocomplete-design.md`

---

### Task 1: Install django-cacheops

**Files:**
- Modify: `backend/requirements/base.txt`
- Modify: `backend/config/settings/base.py:13-41` (INSTALLED_APPS)
- Modify: `backend/config/settings/base.py:88-97` (after CACHES)

**Step 1: Add django-cacheops to requirements**

In `backend/requirements/base.txt`, add at the end:

```
django-cacheops==7.2
```

**Step 2: Add cacheops to INSTALLED_APPS**

In `backend/config/settings/base.py`, add `"cacheops"` to the third-party section of `INSTALLED_APPS` (after `"jsoneditor"`):

```python
INSTALLED_APPS = [
    # ...existing...
    "jsoneditor",
    "cacheops",
    # Local apps
    # ...existing...
]
```

**Step 3: Add CACHEOPS settings**

In `backend/config/settings/base.py`, after the `CACHES` block (line 97), add:

```python
# Cacheops — automatic ORM caching via Redis
CACHEOPS_REDIS = os.environ.get("REDIS_URL", "redis://redis:6379/0")

CACHEOPS = {
    "projects.ProjectFileTree": {"ops": "get", "timeout": 60 * 30},
}
```

**Step 4: Rebuild the backend Docker image**

Run: `docker compose build backend`

**Step 5: Verify cacheops loads**

Run: `docker compose exec backend python -c "import cacheops; print('OK')"`
Expected: `OK`

**Step 6: Commit**

```bash
git add backend/requirements/base.txt backend/config/settings/base.py
git commit -m "chore(backend): install and configure django-cacheops

- Add django-cacheops==7.2 to requirements
- Register cacheops in INSTALLED_APPS
- Configure CACHEOPS_REDIS and cache rules for ProjectFileTree (30min TTL)"
```

---

### Task 2: Create ProjectFileTree model

**Files:**
- Create: `backend/apps/projects/models/file_tree.py`
- Modify: `backend/apps/projects/models/__init__.py`

**Step 1: Write the failing test**

Create `backend/tests/test_file_tree.py`:

```python
import pytest
from rest_framework import status

from tests.factories import ProjectFileTreeFactory

pytestmark = pytest.mark.django_db


def file_tree_url(project_id):
    return f"/api/projects/{project_id}/file-tree/"


class TestProjectFileTreeModel:
    def test_create_file_tree(self, project):
        from projects.models import ProjectFileTree

        ft = ProjectFileTree.objects.create(
            project=project,
            tree=["src/app.tsx", "src/lib/api.ts", "README.md"],
            branch="main",
            synced_at="2026-03-26T12:00:00Z",
        )
        assert ft.project == project
        assert len(ft.tree) == 3
        assert ft.branch == "main"
```

**Step 2: Run test to verify it fails**

Run: `docker compose exec backend pytest tests/test_file_tree.py::TestProjectFileTreeModel::test_create_file_tree -v`
Expected: FAIL — `ImportError: cannot import name 'ProjectFileTree'`

**Step 3: Create the model file**

Create `backend/apps/projects/models/file_tree.py`:

```python
from django.db import models

from common.models import BaseModel


class ProjectFileTree(BaseModel):
    project = models.OneToOneField(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="file_tree",
    )
    tree = models.JSONField(default=list)
    branch = models.CharField(max_length=255, blank=True, default="")
    synced_at = models.DateTimeField()

    class Meta:
        db_table = "project_file_trees"

    def __str__(self):
        return f"FileTree({self.project_id}, {len(self.tree)} files)"
```

**Step 4: Register in models `__init__.py`**

In `backend/apps/projects/models/__init__.py`, add the import and export:

After line 20 (`from projects.models.resource import ...`), add:

```python
from projects.models.file_tree import ProjectFileTree
```

Add `"ProjectFileTree"` to the `__all__` list.

**Step 5: Add the factory**

In `backend/tests/factories.py`, add the import and factory:

Add to the imports from `projects.models`:

```python
from projects.models import (
    # ...existing imports...
    ProjectFileTree,
)
```

Add the factory class after `ProjectMembershipFactory`:

```python
class ProjectFileTreeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProjectFileTree

    project = factory.SubFactory(ProjectFactory)
    tree = ["src/app.tsx", "src/lib/api.ts", "README.md"]
    branch = "main"
    synced_at = factory.LazyFunction(timezone.now)
```

**Step 6: Generate and run migration**

Run: `docker compose exec backend python manage.py makemigrations projects`
Expected: `Migrations for 'projects': ... - Create model ProjectFileTree`

Run: `docker compose exec backend python manage.py migrate`
Expected: `Applying projects.XXXX_projectfiletree... OK`

**Step 7: Run test to verify it passes**

Run: `docker compose exec backend pytest tests/test_file_tree.py::TestProjectFileTreeModel::test_create_file_tree -v`
Expected: PASS

**Step 8: Commit**

```bash
git add backend/apps/projects/models/file_tree.py backend/apps/projects/models/__init__.py \
  backend/apps/projects/migrations/ backend/tests/factories.py backend/tests/test_file_tree.py
git commit -m "feat(projects): add ProjectFileTree model

- Create ProjectFileTree with OneToOne to Project, JSONField tree, branch, synced_at
- Add factory and initial model test
- Generate migration"
```

---

### Task 3: Create selector and service for ProjectFileTree

**Files:**
- Create: `backend/apps/projects/selectors/file_tree_selector.py`
- Create: `backend/apps/projects/services/file_tree_service.py`
- Modify: `backend/apps/projects/selectors/__init__.py`
- Modify: `backend/apps/projects/services/__init__.py`
- Modify: `backend/tests/test_file_tree.py`

**Step 1: Write the failing tests**

Add to `backend/tests/test_file_tree.py`:

```python
class TestFileTreeSelector:
    def test_get_file_tree_exists(self, project):
        ProjectFileTreeFactory(project=project)
        from projects.selectors import get_project_file_tree

        ft = get_project_file_tree(project)
        assert ft is not None
        assert ft.project == project
        assert len(ft.tree) == 3

    def test_get_file_tree_not_exists(self, project):
        from projects.selectors import get_project_file_tree

        ft = get_project_file_tree(project)
        assert ft is None


class TestFileTreeService:
    def test_sync_creates_new(self, project):
        from projects.services import sync_project_file_tree

        ft = sync_project_file_tree(
            project=project,
            tree=["src/index.ts", "package.json"],
            branch="main",
        )
        assert ft.project == project
        assert ft.tree == ["src/index.ts", "package.json"]
        assert ft.branch == "main"

    def test_sync_updates_existing(self, project):
        from projects.services import sync_project_file_tree

        sync_project_file_tree(project=project, tree=["old.py"], branch="main")
        ft = sync_project_file_tree(project=project, tree=["new.py"], branch="develop")

        assert ft.tree == ["new.py"]
        assert ft.branch == "develop"
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_file_tree.py::TestFileTreeSelector -v`
Expected: FAIL — `ImportError: cannot import name 'get_project_file_tree'`

**Step 3: Create the selector**

Create `backend/apps/projects/selectors/file_tree_selector.py`:

```python
from projects.models import ProjectFileTree


def get_project_file_tree(project):
    return ProjectFileTree.objects.filter(project=project).first()
```

**Step 4: Create the service**

Create `backend/apps/projects/services/file_tree_service.py`:

```python
from django.utils import timezone

from projects.models import ProjectFileTree


def sync_project_file_tree(*, project, tree, branch):
    ft, _ = ProjectFileTree.objects.update_or_create(
        project=project,
        defaults={
            "tree": tree,
            "branch": branch,
            "synced_at": timezone.now(),
        },
    )
    return ft
```

**Step 5: Register in `__init__.py` files**

In `backend/apps/projects/selectors/__init__.py`, add:

```python
from projects.selectors.file_tree_selector import get_project_file_tree
```

Add `"get_project_file_tree"` to `__all__`.

In `backend/apps/projects/services/__init__.py`, add:

```python
from projects.services.file_tree_service import sync_project_file_tree
```

Add `"sync_project_file_tree"` to `__all__`.

**Step 6: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_file_tree.py -v`
Expected: All 5 tests PASS

**Step 7: Commit**

```bash
git add backend/apps/projects/selectors/file_tree_selector.py \
  backend/apps/projects/services/file_tree_service.py \
  backend/apps/projects/selectors/__init__.py \
  backend/apps/projects/services/__init__.py \
  backend/tests/test_file_tree.py
git commit -m "feat(projects): add file tree selector and service

- Add get_project_file_tree selector
- Add sync_project_file_tree service with update_or_create
- Add tests for both"
```

---

### Task 4: Create REST endpoint for file tree

**Files:**
- Modify: `backend/apps/projects/serializers/output.py`
- Create: `backend/apps/projects/views/file_tree_views.py`
- Modify: `backend/apps/projects/views/__init__.py`
- Modify: `backend/apps/projects/urls.py`
- Modify: `backend/tests/test_file_tree.py`

**Step 1: Write the failing tests**

Add to `backend/tests/test_file_tree.py`:

```python
class TestFileTreeAPI:
    def test_get_file_tree(self, authenticated_client, project):
        ProjectFileTreeFactory(project=project)
        url = file_tree_url(project.id)
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["tree"] == ["src/app.tsx", "src/lib/api.ts", "README.md"]
        assert response.data["branch"] == "main"
        assert response.data["synced_at"] is not None

    def test_get_file_tree_empty(self, authenticated_client, project):
        url = file_tree_url(project.id)
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["tree"] == []
        assert response.data["branch"] == ""
        assert response.data["synced_at"] is None

    def test_get_file_tree_unauthenticated(self, api_client, project):
        url = file_tree_url(project.id)
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_file_tree.py::TestFileTreeAPI -v`
Expected: FAIL — 404 (URL not registered)

**Step 3: Create the output serializer**

In `backend/apps/projects/serializers/output.py`, add at the end:

```python
class ProjectFileTreeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectFileTree
        fields = ["tree", "branch", "synced_at"]
        read_only_fields = fields
```

Add `ProjectFileTree` to the imports at the top of the file (from `projects.models`).

**Step 4: Create the view**

Create `backend/apps/projects/views/file_tree_views.py`:

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.permissions import IsProjectAccessible
from projects.selectors import get_project_file_tree
from projects.serializers.output import ProjectFileTreeSerializer


class ProjectFileTreeView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def get(self, request, project_id):
        file_tree = get_project_file_tree(request.project)
        if file_tree is None:
            return Response(
                {"tree": [], "branch": "", "synced_at": None},
                status=status.HTTP_200_OK,
            )
        output = ProjectFileTreeSerializer(file_tree).data
        return Response(output, status=status.HTTP_200_OK)
```

**Step 5: Register view in `__init__.py`**

In `backend/apps/projects/views/__init__.py`, add:

```python
from projects.views.file_tree_views import ProjectFileTreeView
```

Add `"ProjectFileTreeView"` to `__all__`.

**Step 6: Register URL**

In `backend/apps/projects/urls.py`, add the import and URL pattern.

Add `ProjectFileTreeView` to the imports from `projects.views`.

Add the URL pattern after the settings path (after line 35):

```python
    # File tree
    path("<uuid:project_id>/file-tree/", ProjectFileTreeView.as_view(), name="project-file-tree"),
```

**Step 7: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_file_tree.py::TestFileTreeAPI -v`
Expected: All 3 tests PASS

**Step 8: Run full test suite**

Run: `docker compose exec backend pytest -v`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add backend/apps/projects/serializers/output.py \
  backend/apps/projects/views/file_tree_views.py \
  backend/apps/projects/views/__init__.py \
  backend/apps/projects/urls.py \
  backend/tests/test_file_tree.py
git commit -m "feat(projects): add file tree REST endpoint

- Add ProjectFileTreeSerializer output serializer
- Add ProjectFileTreeView with GET (returns empty response if no tree)
- Register URL at /api/projects/<id>/file-tree/
- Add API tests"
```

---

### Task 5: Add WebSocket handler for file_tree.sync

**Files:**
- Modify: `backend/apps/toony_agents/consumers.py`

**Step 1: Add the async DB helper**

In `backend/apps/toony_agents/consumers.py`, add a new async DB helper after the existing ones (before the `ToonyAgentRunnerConsumer` class):

```python
@database_sync_to_async
def _sync_file_tree(project_id, tree, branch):
    from projects.models import Project, ProjectFileTree
    from django.utils import timezone as tz

    project = Project.objects.filter(id=project_id).first()
    if project is None:
        return None
    ProjectFileTree.objects.update_or_create(
        project=project,
        defaults={"tree": tree, "branch": branch, "synced_at": tz.now()},
    )
    return project_id
```

**Step 2: Add the message handler**

In `ToonyAgentRunnerConsumer.receive_json`, add a new `elif` branch before the `else` (before line 685):

```python
        elif msg_type == "file_tree.sync":
            project_id = content.get("project_id")
            tree = content.get("tree", [])
            branch = content.get("branch", "")
            if not project_id:
                await self.send_json({"type": "error", "message": "project_id is required"})
                return
            result = await _sync_file_tree(project_id, tree, branch)
            if result is None:
                await self.send_json({"type": "error", "message": "Project not found"})
                return
            await self.send_json({"type": "file_tree.sync.ack", "project_id": str(result)})
```

**Step 3: Run existing tests to ensure no regressions**

Run: `docker compose exec backend pytest -v`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add backend/apps/toony_agents/consumers.py
git commit -m "feat(toony-agents): handle file_tree.sync WebSocket message

- Add _sync_file_tree async DB helper
- Add file_tree.sync message handler in runner consumer
- Send file_tree.sync.ack on success"
```

---

### Task 6: Create the FileAutoComplete frontend component

**Files:**
- Create: `frontend/components/ui/file-autocomplete.tsx`

**Step 1: Create the component**

Create `frontend/components/ui/file-autocomplete.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback, KeyboardEvent, ChangeEvent } from "react";
import api from "@/lib/api";

interface FileAutoCompleteProps {
  projectId: string | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

interface MentionState {
  active: boolean;
  startIndex: number;
  query: string;
  position: { top: number; left: number };
}

export default function FileAutoComplete({
  projectId,
  value,
  onChange,
  placeholder,
  rows = 3,
  className = "",
  onKeyDown: externalOnKeyDown,
}: FileAutoCompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [fileTree, setFileTree] = useState<string[]>([]);
  const [mention, setMention] = useState<MentionState>({
    active: false,
    startIndex: 0,
    query: "",
    position: { top: 0, left: 0 },
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch file tree when projectId changes
  useEffect(() => {
    if (!projectId) {
      setFileTree([]);
      return;
    }
    let cancelled = false;
    api
      .get(`/projects/${projectId}/file-tree/`)
      .then((res) => {
        if (!cancelled) setFileTree(res.data.tree || []);
      })
      .catch(() => {
        if (!cancelled) setFileTree([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Filter files based on query (case-insensitive substring match)
  const filtered = mention.active
    ? fileTree
        .filter((f) => f.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 20)
    : [];

  // Calculate cursor position using mirror div
  const getCursorPosition = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return { top: 0, left: 0 };

    // Copy styles from textarea to mirror
    const computed = window.getComputedStyle(textarea);
    const stylesToCopy = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "wordSpacing",
      "textIndent",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "boxSizing",
    ] as const;
    stylesToCopy.forEach((prop) => {
      (mirror.style as any)[prop] = computed[prop];
    });
    mirror.style.width = `${textarea.offsetWidth}px`;
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflow = "hidden";

    // Insert text up to cursor with a span marker
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
    mirror.innerHTML = "";
    const textNode = document.createTextNode(textBeforeCursor);
    const marker = document.createElement("span");
    marker.textContent = "\u200b"; // zero-width space
    mirror.appendChild(textNode);
    mirror.appendChild(marker);

    const markerRect = marker.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();

    return {
      top: markerRect.top - textareaRect.top + textarea.scrollTop + 20,
      left: markerRect.left - textareaRect.left,
    };
  }, []);

  // Detect "@" trigger on input change
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);

    // Find the last "@" before cursor that isn't preceded by a non-space char
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1 || fileTree.length === 0) {
      setMention((prev) => ({ ...prev, active: false }));
      return;
    }

    // "@" must be at start or preceded by whitespace
    if (lastAtIndex > 0 && !/\s/.test(textBeforeCursor[lastAtIndex - 1])) {
      setMention((prev) => ({ ...prev, active: false }));
      return;
    }

    const query = textBeforeCursor.substring(lastAtIndex + 1);

    // Close if there's a space in the query (user moved on)
    if (query.includes(" ")) {
      setMention((prev) => ({ ...prev, active: false }));
      return;
    }

    const position = getCursorPosition();
    setMention({ active: true, startIndex: lastAtIndex, query, position });
    setSelectedIndex(0);
  };

  // Select a file from the dropdown
  const selectFile = useCallback(
    (filePath: string) => {
      const before = value.substring(0, mention.startIndex);
      const after = value.substring(mention.startIndex + 1 + mention.query.length);
      const newValue = `${before}@${filePath}${after}`;
      onChange(newValue);
      setMention((prev) => ({ ...prev, active: false }));

      // Restore cursor position after the inserted path
      const newCursorPos = mention.startIndex + 1 + filePath.length;
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current?.focus();
      });
    },
    [value, mention.startIndex, mention.query, onChange]
  );

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.active && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectFile(filtered[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention((prev) => ({ ...prev, active: false }));
        return;
      }
    }
    externalOnKeyDown?.(e);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!mention.active) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setMention((prev) => ({ ...prev, active: false }));
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mention.active]);

  // Scroll selected item into view
  useEffect(() => {
    if (!mention.active || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll("[data-file-item]");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, mention.active]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {/* Hidden mirror div for cursor position calculation */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0"
      />
      {/* Dropdown */}
      {mention.active && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 max-h-48 w-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
          style={{ top: mention.position.top, left: mention.position.left }}
        >
          {filtered.map((file, i) => (
            <button
              key={file}
              data-file-item
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                i === selectedIndex
                  ? "bg-indigo-600/30 text-indigo-300"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectFile(file);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <svg
                className="h-4 w-4 shrink-0 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              <span className="truncate">{file}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify frontend compiles**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds (component created but not yet imported anywhere)

**Step 3: Commit**

```bash
git add frontend/components/ui/file-autocomplete.tsx
git commit -m "feat(frontend): add FileAutoComplete component

- Textarea wrapper with @ mention autocomplete for project files
- Fetches file tree from /api/projects/<id>/file-tree/
- Dropdown with keyboard navigation (arrows, Enter/Tab, Escape)
- Cursor positioning via hidden mirror div
- Case-insensitive substring filtering, max 20 results"
```

---

### Task 7: Integrate FileAutoComplete into CreateIssueModal

**Files:**
- Modify: `frontend/components/issues/create-issue-modal.tsx`

**Step 1: Read the current file**

Read `frontend/components/issues/create-issue-modal.tsx` to find the exact description textarea code.

**Step 2: Replace the description textarea**

Import the component at the top:

```tsx
import FileAutoComplete from "@/components/ui/file-autocomplete";
```

Find the description `<textarea>` element and replace it with `<FileAutoComplete>`. The component needs the project's ID passed via props. The `CreateIssueModal` already receives `projectId` as a prop.

Replace the textarea (look for the textarea with `value={description}` and `onChange={(e) => setDescription(e.target.value)}`):

```tsx
<FileAutoComplete
  projectId={projectId}
  value={description}
  onChange={setDescription}
  placeholder="Describe the issue..."
  rows={3}
  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
/>
```

**Step 3: Verify frontend compiles**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/components/issues/create-issue-modal.tsx
git commit -m "feat(frontend): integrate FileAutoComplete into CreateIssueModal

- Replace plain textarea with FileAutoComplete for description field
- Pass projectId for file tree loading"
```

---

### Task 8: Integrate FileAutoComplete into QuickCreateIssueModal

**Files:**
- Modify: `frontend/components/tasks/quick-create-issue-modal.tsx`

**Step 1: Read the current file**

Read `frontend/components/tasks/quick-create-issue-modal.tsx` to find the exact description textarea code. Note: this modal has dynamic project selection — `projectId` changes based on user selection.

**Step 2: Replace the description textarea**

Import the component at the top:

```tsx
import FileAutoComplete from "@/components/ui/file-autocomplete";
```

Find the description textarea (look for the auto-resizing textarea with `ref={textareaRef}`) and replace it with `<FileAutoComplete>`. Use the selected project ID from the component's state.

Important: the auto-resize logic (`autoResize` function) won't work with FileAutoComplete since the ref changes. The auto-resize can be dropped for now since `<FileAutoComplete>` manages its own textarea. If the expanded mode changes `rows`, pass the correct `rows` prop conditionally.

```tsx
<FileAutoComplete
  projectId={selectedProjectId}
  value={description}
  onChange={setDescription}
  placeholder="Add description..."
  rows={expanded ? 16 : 6}
  className="mt-3 w-full resize-none border-0 bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none"
/>
```

Remove the `textareaRef` and `autoResize` logic related to the description textarea (only if not used elsewhere in the component).

**Step 3: Verify frontend compiles**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/components/tasks/quick-create-issue-modal.tsx
git commit -m "feat(frontend): integrate FileAutoComplete into QuickCreateIssueModal

- Replace auto-resizing textarea with FileAutoComplete for description
- Pass selected project ID for dynamic file tree loading"
```

---

### Task 9: Integrate FileAutoComplete into IssueSidePanel

**Files:**
- Modify: `frontend/components/tasks/issue-side-panel.tsx`

**Step 1: Read the current file**

Read `frontend/components/tasks/issue-side-panel.tsx` to find the description edit textarea.

**Step 2: Replace the description textarea**

Import the component:

```tsx
import FileAutoComplete from "@/components/ui/file-autocomplete";
```

Find the textarea used for editing the description (the one shown when `editingDescription` is true) and replace it with `<FileAutoComplete>`. The issue's `project` ID needs to be extracted — check how the side panel receives the issue data and find the project ID (likely `issue.project` or `issue.project_id`).

```tsx
<FileAutoComplete
  projectId={issue.project?.id || issue.project_id || null}
  value={descriptionDraft}
  onChange={setDescriptionDraft}
  placeholder="Add description..."
  rows={4}
  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
  onKeyDown={(e) => { if (e.key === "Escape") cancelEditDescription(); }}
/>
```

**Step 3: Verify frontend compiles**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/components/tasks/issue-side-panel.tsx
git commit -m "feat(frontend): integrate FileAutoComplete into IssueSidePanel

- Replace description edit textarea with FileAutoComplete
- Preserve Escape-to-cancel behavior"
```

---

### Task 10: Integrate FileAutoComplete into Issue Detail Page

**Files:**
- Modify: `frontend/app/(dashboard)/projects/[id]/issues/[issueId]/page.tsx`

**Step 1: Read the current file**

Read `frontend/app/(dashboard)/projects/[id]/issues/[issueId]/page.tsx` to find:
1. The description edit textarea
2. The new comment textarea
3. The comment edit textarea

**Step 2: Import FileAutoComplete**

```tsx
import FileAutoComplete from "@/components/ui/file-autocomplete";
```

**Step 3: Replace the description edit textarea**

Find the textarea for editing the description (shown when `editingDescription` is true). The `projectId` is available from the route params (`params.id`).

```tsx
<FileAutoComplete
  projectId={params.id}
  value={descriptionDraft}
  onChange={setDescriptionDraft}
  placeholder="Add description..."
  rows={4}
  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
  onKeyDown={(e) => { if (e.key === "Escape") cancelEditDescription(); }}
/>
```

**Step 4: Replace the new comment textarea**

Find the textarea in `CommentsSection` for adding new comments:

```tsx
<FileAutoComplete
  projectId={projectId}
  value={newComment}
  onChange={setNewComment}
  placeholder="Write a comment..."
  rows={3}
  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
/>
```

Note: `CommentsSection` might need to receive `projectId` as a prop if it doesn't already have access to it.

**Step 5: Replace the comment edit textarea**

Find the textarea for editing existing comments:

```tsx
<FileAutoComplete
  projectId={projectId}
  value={editText}
  onChange={setEditText}
  placeholder="Edit comment..."
  rows={2}
  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
  onKeyDown={(e) => { if (e.key === "Escape") setEditingCommentId(null); }}
/>
```

**Step 6: Verify frontend compiles**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add frontend/app/\(dashboard\)/projects/\[id\]/issues/\[issueId\]/page.tsx
git commit -m "feat(frontend): integrate FileAutoComplete into issue detail page

- Replace description edit textarea with FileAutoComplete
- Replace new comment textarea with FileAutoComplete
- Replace comment edit textarea with FileAutoComplete"
```

---

### Task 11: Run full test suite and lint

**Files:** None (verification only)

**Step 1: Run backend tests**

Run: `docker compose exec backend pytest -v`
Expected: All tests PASS

**Step 2: Run backend lint**

Run: `docker compose exec backend ruff check .`
Expected: No errors

**Step 3: Run frontend lint**

Run: `docker compose exec frontend npm run lint`
Expected: No errors

**Step 4: Run frontend build**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds

---

### Task 12: Final integration commit

**Step 1: Verify git status**

Run: `git status`
Expected: Clean working tree (all changes already committed in previous tasks)

**Step 2: If any remaining changes, commit them**

```bash
git add -A
git commit -m "chore: final cleanup for file mention autocomplete feature"
```
