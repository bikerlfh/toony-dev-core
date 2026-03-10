# Backend Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all Django apps into `backend/apps/` and requirements into `backend/requirements/` while keeping all imports unchanged.

**Architecture:** Add `apps/` to `sys.path` in the 3 Django entry points (manage.py, asgi.py, wsgi.py) so every existing import resolves without changes. Move requirements files and update all external references (Dockerfiles, CI, Makefile).

**Tech Stack:** Django 5, Docker, GitHub Actions

---

### Task 1: Create feature branch

**Step 1: Create and checkout branch**

```bash
git checkout -b refactor/backend-restructure
```

**Step 2: Verify**

```bash
git branch --show-current
```

Expected: `refactor/backend-restructure`

---

### Task 2: Move Django apps into `apps/`

**Files:**
- Create: `backend/apps/` (directory)
- Move: `backend/accounts/` → `backend/apps/accounts/`
- Move: `backend/organizations/` → `backend/apps/organizations/`
- Move: `backend/projects/` → `backend/apps/projects/`
- Move: `backend/workspace/` → `backend/apps/workspace/`
- Move: `backend/agents/` → `backend/apps/agents/`
- Move: `backend/workflows/` → `backend/apps/workflows/`
- Move: `backend/toony_agents/` → `backend/apps/toony_agents/`
- Move: `backend/importers/` → `backend/apps/importers/`
- Move: `backend/common/` → `backend/apps/common/`

**Step 1: Create `apps/` directory and move all apps**

```bash
cd /Users/luismo/Documents/new_projects/toony-dev-core/backend
mkdir -p apps
git mv accounts apps/accounts
git mv organizations apps/organizations
git mv projects apps/projects
git mv workspace apps/workspace
git mv agents apps/agents
git mv workflows apps/workflows
git mv toony_agents apps/toony_agents
git mv importers apps/importers
git mv common apps/common
```

**Step 2: Verify structure**

```bash
ls backend/apps/
```

Expected: `accounts agents common importers organizations projects toony_agents workflows workspace`

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move all Django apps into apps/ directory"
```

---

### Task 3: Add `apps/` to Python path in entry points

**Files:**
- Modify: `backend/manage.py`
- Modify: `backend/config/asgi.py`
- Modify: `backend/config/wsgi.py`

**Step 1: Update `manage.py`**

Replace the full file content with:

```python
#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys
from pathlib import Path


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    # Add apps/ to the Python path so app imports resolve without prefix
    sys.path.insert(0, str(Path(__file__).resolve().parent / "apps"))

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

**Step 2: Update `config/asgi.py`**

Replace the full file content with:

```python
import os
import sys
from pathlib import Path

# Add apps/ to the Python path so app imports resolve without prefix
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps"))

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

from common.middleware import JwtAuthMiddleware  # noqa: E402
from config.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JwtAuthMiddleware(URLRouter(websocket_urlpatterns)),
    }
)
```

**Step 3: Update `config/wsgi.py`**

Replace the full file content with:

```python
import os
import sys
from pathlib import Path

# Add apps/ to the Python path so app imports resolve without prefix
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps"))

from django.core.wsgi import get_wsgi_application  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
```

**Step 4: Commit**

```bash
git add backend/manage.py backend/config/asgi.py backend/config/wsgi.py
git commit -m "refactor: add apps/ to sys.path in Django entry points"
```

---

### Task 4: Move and rename requirements files

**Files:**
- Create: `backend/requirements/` (directory)
- Move: `backend/requirements.txt` → `backend/requirements/base.txt`
- Move: `backend/requirements-dev.txt` → `backend/requirements/dev.txt`
- Modify: `backend/requirements/dev.txt` (update `-r` reference)

**Step 1: Create directory and move files**

```bash
cd /Users/luismo/Documents/new_projects/toony-dev-core/backend
mkdir -p requirements
git mv requirements.txt requirements/base.txt
git mv requirements-dev.txt requirements/dev.txt
```

**Step 2: Update the `-r` reference in `dev.txt`**

In `backend/requirements/dev.txt`, change line 1 from:

```
-r requirements.txt
```

to:

```
-r base.txt
```

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move requirements into requirements/ directory"
```

---

### Task 5: Update Dockerfiles

**Files:**
- Modify: `docker/Dockerfile.backend:11-12`
- Modify: `docker/Dockerfile.backend.prod:12-13`

**Step 1: Update `docker/Dockerfile.backend`**

Change lines 11-12 from:

```dockerfile
COPY requirements.txt requirements-dev.txt ./
RUN uv pip install --no-cache-dir --system -r requirements-dev.txt
```

to:

```dockerfile
COPY requirements/ requirements/
RUN uv pip install --no-cache-dir --system -r requirements/dev.txt
```

**Step 2: Update `docker/Dockerfile.backend.prod`**

Change lines 12-13 from:

```dockerfile
COPY requirements.txt .
RUN uv pip install --no-cache-dir --prefix=/install -r requirements.txt
```

to:

```dockerfile
COPY requirements/ requirements/
RUN uv pip install --no-cache-dir --prefix=/install -r requirements/base.txt
```

**Step 3: Commit**

```bash
git add docker/Dockerfile.backend docker/Dockerfile.backend.prod
git commit -m "refactor: update Dockerfiles for new requirements path"
```

---

### Task 6: Update CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml:26,74,78`

**Step 1: Update cache keys and install path**

In `.github/workflows/ci.yml`, make these 3 changes:

Line 26 — change cache key hash from:
```yaml
key: ${{ runner.os }}-pip-lint-${{ hashFiles('backend/requirements-dev.txt') }}
```
to:
```yaml
key: ${{ runner.os }}-pip-lint-${{ hashFiles('backend/requirements/dev.txt') }}
```

Line 74 — change cache key hash from:
```yaml
key: ${{ runner.os }}-pip-test-${{ hashFiles('backend/requirements-dev.txt') }}
```
to:
```yaml
key: ${{ runner.os }}-pip-test-${{ hashFiles('backend/requirements/dev.txt') }}
```

Line 78 — change install path from:
```yaml
run: pip install -r requirements-dev.txt
```
to:
```yaml
run: pip install -r requirements/dev.txt
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "refactor: update CI config for new requirements path"
```

---

### Task 7: Update Makefile

**Files:**
- Modify: `Makefile:76-78`

**Step 1: Update reset-migrations target**

Change lines 76-78 from:

```makefile
	$(BACKEND) find accounts organizations projects workspace agents workflows toony_agents importers \
		-path "*/migrations/[0-9]*.py" -delete
	$(MANAGE) makemigrations accounts organizations projects workspace agents workflows toony_agents importers
```

to:

```makefile
	$(BACKEND) find apps/accounts apps/organizations apps/projects apps/workspace apps/agents apps/workflows apps/toony_agents apps/importers \
		-path "*/migrations/[0-9]*.py" -delete
	$(MANAGE) makemigrations accounts organizations projects workspace agents workflows toony_agents importers
```

Note: only the `find` paths need `apps/` prefix. The `makemigrations` command uses Django app labels (which remain unchanged since INSTALLED_APPS is untouched).

**Step 2: Commit**

```bash
git add Makefile
git commit -m "refactor: update Makefile app paths for apps/ directory"
```

---

### Task 8: Update CLAUDE.md files

**Files:**
- Modify: `backend/CLAUDE.md` — update single test example path context
- Modify: `CLAUDE.md` — update backend architecture description if needed

**Step 1: Review and update `backend/CLAUDE.md`**

No path changes needed in `backend/CLAUDE.md` because:
- Make commands run inside Docker where `/app` maps to `backend/` — commands like `pytest tests/` still work
- The architecture description references app-internal paths (models/, views/, etc.) which are unchanged

No changes required.

**Step 2: Review and update root `CLAUDE.md`**

The root `CLAUDE.md` references "Six Django apps" but there are actually 9 (including workspace, toony_agents, importers). This is pre-existing inaccuracy and out of scope for this refactor.

No changes required for the restructure.

**Step 3: Commit (skip if no changes)**

---

### Task 9: Verify everything works

**Step 1: Rebuild Docker containers**

```bash
make build
```

Expected: Build succeeds, dependencies install from new paths.

**Step 2: Start services**

```bash
make up-backend
```

Expected: Backend starts without import errors.

**Step 3: Run tests**

```bash
make test
```

Expected: All tests pass.

**Step 4: Run linter**

```bash
make lint
```

Expected: No new lint errors.

**Step 5: Final commit if any adjustments were needed**

If tests or lint revealed issues, fix and commit.

---

### Task 10: Update pyproject.toml PYTHONPATH for pytest

**Files:**
- Modify: `backend/pyproject.toml`

**Important:** pytest needs to find the apps too. Check if `pyproject.toml` has a `pythonpath` setting under `[tool.pytest.ini_options]`. If not, add one.

**Step 1: Check current pytest config and add pythonpath**

In `backend/pyproject.toml`, under `[tool.pytest.ini_options]`, add:

```toml
pythonpath = ["apps"]
```

This ensures pytest can resolve app imports when running outside Docker (e.g., in CI where `manage.py` isn't invoked first).

**Step 2: Commit**

```bash
git add backend/pyproject.toml
git commit -m "refactor: add apps/ to pytest pythonpath"
```

---

### Task 11: Update conftest.py PYTHONPATH (CI safety)

**Files:**
- Modify: `backend/conftest.py`

**Step 1: Check if conftest.py needs path setup**

The CI job runs `pytest --cov` directly (not via `manage.py`), so `sys.path` from `manage.py` won't be set. The `pythonpath` in `pyproject.toml` (Task 10) handles this for pytest. No conftest changes needed.

Skip this task — covered by Task 10.

---

### Summary of all changes

| File | Change |
|---|---|
| `backend/apps/*` | 9 app directories moved here |
| `backend/manage.py` | Add `sys.path.insert` for `apps/` |
| `backend/config/asgi.py` | Add `sys.path.insert` for `apps/` |
| `backend/config/wsgi.py` | Add `sys.path.insert` for `apps/` |
| `backend/requirements/base.txt` | Moved from `requirements.txt` |
| `backend/requirements/dev.txt` | Moved from `requirements-dev.txt`, updated `-r` |
| `backend/pyproject.toml` | Add `pythonpath = ["apps"]` to pytest config |
| `docker/Dockerfile.backend` | Update COPY + pip install paths |
| `docker/Dockerfile.backend.prod` | Update COPY + pip install paths |
| `.github/workflows/ci.yml` | Update cache keys + install path |
| `Makefile` | Update `find` paths in reset-migrations |
