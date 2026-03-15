# Backend Restructure Design

## Goal

Reorganize the backend directory to move all Django apps into an `apps/` folder and requirements files into a `requirements/` folder.

## Approach

Use `sys.path.insert` to add `apps/` to the Python path so all existing imports remain unchanged (~511 imports across ~196 files stay untouched).

## Resulting Structure

```
backend/
├── apps/
│   ├── accounts/
│   ├── organizations/
│   ├── projects/
│   ├── workspace/
│   ├── agents/
│   ├── workflows/
│   ├── toony_agents/
│   ├── importers/
│   └── common/
├── requirements/
│   ├── base.txt
│   └── dev.txt
├── config/
├── tests/
├── fixtures/
├── staticfiles/
├── conftest.py
├── manage.py
└── pyproject.toml
```

## Changes Required

### 1. Move apps (9 directories)

Move to `apps/`: accounts, organizations, projects, workspace, agents, workflows, toony_agents, importers, common.

### 2. Python path configuration

Add `sys.path.insert(0, str(BASE_DIR / "apps"))` in:

- `manage.py`
- `config/asgi.py`
- `config/wsgi.py`

### 3. Requirements

- `requirements.txt` → `requirements/base.txt`
- `requirements-dev.txt` → `requirements/dev.txt`
- Update `-r requirements.txt` → `-r base.txt` inside `dev.txt`

### 4. External references to update

- `docker/Dockerfile.backend` — COPY paths for requirements
- `docker/Dockerfile.backend.prod` — COPY paths for requirements
- `.github/workflows/ci.yml` — cache key paths and pip install path
- `Makefile` — app paths in reset-migrations target

### 5. No changes needed

- All imports (~511 occurrences) remain the same
- `INSTALLED_APPS` in settings unchanged
- `config/urls.py` and `config/routing.py` unchanged
- `pyproject.toml` (ruff config) unchanged
- Tests and conftest unchanged
