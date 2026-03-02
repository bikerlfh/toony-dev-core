# Phase 1: Project Bootstrap & Infrastructure

## Context

The Toony Dev Core repo currently contains only `.git/`, `.gitignore`, and design docs. Phase 1 creates the foundational infrastructure that all subsequent phases depend on: Docker orchestration, Django backend, Next.js frontend, PostgreSQL/Redis services, and a health check endpoint.

**Design doc:** `docs/2026-03-01-toony-dev-core-design.md`

---

## Plan

### A. Environment & Git Config

1. **Create `.env.example`** — all env vars: `SECRET_KEY`, `DEBUG`, `ENVIRONMENT`, `ALLOWED_HOSTS`, `DB_*`, `REDIS_URL`, `CORS_ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`, `FIELD_ENCRYPTION_KEY`
2. **Replace `.gitignore`** — add `.env`, `__pycache__/`, `venv/`, `node_modules/`, `.next/`, `*.sqlite3`, `.coverage`, `.pytest_cache/`; remove irrelevant Java/media patterns
3. **Create `.dockerignore`** — exclude `.git`, `.env`, `__pycache__`, `node_modules`, `.next`, `docs/`

### B. Docker Infrastructure

4. **Create `docker/Dockerfile.backend`** — `python:3.12-slim`, install gcc/libpq-dev, pip install requirements, run uvicorn with `--reload`
5. **Create `docker/Dockerfile.frontend`** — `node:20-alpine`, npm install, run `npm run dev`
6. **Create `docker-compose.yml`** (project root) — 4 services:
   - `db`: postgres:16-alpine, healthcheck via `pg_isready`, volume for data persistence
   - `redis`: redis:7-alpine, healthcheck via `redis-cli ping`
   - `backend`: build from Dockerfile.backend, port 8000, volume mount `./backend:/app`, depends on db+redis (healthy)
   - `frontend`: build from Dockerfile.frontend, port 3000, volume mount `./frontend:/app` + anonymous `/app/node_modules`, depends on backend

### C. Django Project (`backend/`)

7. **Create `backend/requirements.txt`** — Django 5.1, DRF, simplejwt, cors-headers, django-filter, channels, channels-redis, django-redis, django-encrypted-model-fields, psycopg2-binary, uvicorn[standard], gunicorn, daphne
8. **Create `backend/manage.py`** — standard, `DJANGO_SETTINGS_MODULE=config.settings`
9. **Create `backend/config/settings/__init__.py`** — load `development` or `production` based on `ENVIRONMENT` env var
10. **Create `backend/config/settings/base.py`** — core settings:
    - INSTALLED_APPS: daphne, django builtins, rest_framework, simplejwt, corsheaders, django_filters, channels, + app stubs (common, accounts, organizations, projects, agents, importers)
    - DATABASES: PostgreSQL from env vars
    - CACHES: django-redis, REDIS_URL
    - CHANNEL_LAYERS: channels-redis
    - REST_FRAMEWORK: JWT auth, IsAuthenticated default, filter backends, JSON renderer, PageNumberPagination(50)
    - SIMPLE_JWT: 30min access, 7d refresh, rotate+blacklist
    - CORS from env vars
    - `AUTH_USER_MODEL` commented out (enabled in Phase 2)
    - `APP_VERSION = "0.1.0"`
11. **Create `backend/config/settings/development.py`** — DEBUG=True, ALLOWED_HOSTS=["*"], SQL logging, add BrowsableAPIRenderer
12. **Create `backend/config/settings/production.py`** — DEBUG=False, security headers (HSTS, secure cookies, SSL redirect)
13. **Create `backend/config/urls.py`** — admin + `api/v1/health/` -> `common.urls`
14. **Create `backend/config/asgi.py`** — Channels `ProtocolTypeRouter` with HTTP only (WebSocket in Phase 14)
15. **Create `backend/config/wsgi.py`** — standard WSGI
16. **Create `backend/config/__init__.py`** — empty

### D. Common App

17. **Create `backend/common/apps.py`** — CommonConfig
18. **Create `backend/common/models.py`** — `BaseModel(models.Model)`: UUID pk, created_at (auto_now_add), updated_at (auto_now), abstract=True, ordering=["-created_at"]
19. **Create `backend/common/exceptions.py`** — `ServiceUnavailable` (503), `ConflictError` (409)
20. **Create `backend/common/views.py`** — `health_check` FBV:
    - `@permission_classes([AllowAny])`, no auth
    - Check DB: `SELECT 1` via cursor
    - Check Redis: `cache.set`/`cache.get` round-trip
    - Return `{status, services: {database, redis}, timestamp, version}`
    - 200 if healthy, 503 if any service down
21. **Create `backend/common/urls.py`** — single route `""` -> `health_check`
22. **Create `backend/common/__init__.py`** — empty

### E. App Stubs (Future Phases)

23. **For each of `accounts`, `organizations`, `projects`, `agents`, `importers`:** create `__init__.py` + `apps.py` (minimal AppConfig with `name` and `default_auto_field`). Required because they're listed in INSTALLED_APPS.

### F. Next.js Frontend (`frontend/`)

24. **Create `frontend/package.json`** — next ^15.1, react ^19, react-dom ^19, axios ^1.7; devDeps: typescript ^5.7, tailwindcss ^4.0, @tailwindcss/postcss ^4.0, postcss ^8.5, @types/node, @types/react, @types/react-dom, eslint, eslint-config-next
25. **Create `frontend/tsconfig.json`** — strict, bundler moduleResolution, `@/*` path alias
26. **Create `frontend/next.config.ts`** — reactStrictMode: true
27. **Create `frontend/postcss.config.mjs`** — `@tailwindcss/postcss` plugin (Tailwind v4 style)
28. **Create `frontend/app/globals.css`** — `@import "tailwindcss"` (v4 syntax)
29. **Create `frontend/app/layout.tsx`** — root layout with metadata, imports globals.css
30. **Create `frontend/app/page.tsx`** — simple landing: "Toony Dev Core" heading + subtitle
31. **Create `frontend/lib/api.ts`** — axios instance with `NEXT_PUBLIC_API_URL`, placeholder request/response interceptors for future JWT handling
32. **Create `frontend/components/.gitkeep`** — empty placeholder

### G. Documentation & Tracking

33. **Save this plan** as `docs/plans/phase-01-bootstrap.md`
34. **Update `docs/plans/implementation-phases.md`** — mark Phase 1 Plan Generated as ✅

---

## File Manifest

**41 new files, 2 modified files:**

| Section | Files |
|---------|-------|
| A (env) | `.env.example`, `.gitignore` (modify), `.dockerignore` |
| B (Docker) | `docker/Dockerfile.backend`, `docker/Dockerfile.frontend`, `docker-compose.yml` |
| C (Django) | `backend/manage.py`, `backend/requirements.txt`, `backend/config/__init__.py`, `backend/config/settings/{__init__,base,development,production}.py`, `backend/config/{urls,asgi,wsgi}.py` |
| D (Common) | `backend/common/{__init__,apps,models,exceptions,views,urls}.py` |
| E (Stubs) | `backend/{accounts,organizations,projects,agents,importers}/{__init__,apps}.py` (10 files) |
| F (Frontend) | `frontend/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs}`, `frontend/app/{layout.tsx,globals.css,page.tsx}`, `frontend/lib/api.ts`, `frontend/components/.gitkeep` |
| G (Docs) | `docs/plans/phase-01-bootstrap.md`, `docs/plans/implementation-phases.md` (modify) |

---

## Verification

1. `docker compose up --build` — all 4 services start without errors
2. `docker compose exec backend python manage.py migrate` — Django built-in migrations apply successfully
3. `curl http://localhost:8000/api/v1/health/` — returns 200 with `{"status":"healthy","services":{"database":"up","redis":"up"},...}`
4. `http://localhost:3000` — renders "Toony Dev Core" heading
5. Edit `frontend/app/page.tsx` — hot-reload reflects change in browser
6. Edit `backend/common/views.py` — uvicorn auto-reloads
