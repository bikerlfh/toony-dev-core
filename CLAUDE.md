# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Toony Dev Core is a full-stack project management application. Django 5 + DRF backend, Next.js 15 + React 19 frontend, orchestrated with Docker Compose.

Monorepo structure: `backend/` (Django/Python), `frontend/` (Next.js/TypeScript).

## Common Commands

All commands run through the Makefile via Docker Compose:

```bash
make up                 # Start all services (postgres, redis, backend, frontend)
make down               # Stop all services
make up-backend         # Start backend stack only (postgres + redis + backend)
make logs-backend       # Tail backend logs
make logs-frontend      # Tail frontend logs

make migrate            # Run Django migrations
make makemigrations     # Generate new migrations
make loaddata file="all" # Load fixture data from fixtures/all.json

make test               # Run backend tests (pytest -v)
make test-cov           # Run tests with coverage report
make lint               # Backend linting (flake8)
make lint-frontend      # Frontend linting (next lint)

make shell              # Django shell inside container
make dbshell            # psql shell
make reset-db           # Destructive: drop volumes, recreate DB, re-migrate
```

To run a single backend test:
```bash
docker compose exec backend pytest tests/test_issues.py::TestIssueAPI::test_create_issue -v
```

Frontend build (inside container or locally):
```bash
./node_modules/.bin/next build    # avoid npx picking wrong version
```

## Architecture

### Backend (Django 5 / DRF)

Layered architecture per domain app:
```
Request → URLs → Permission (resolves + attaches org/project to request) → View → Selector (reads) / Service (writes) → Serializer → Response
```

Six Django apps: `accounts`, `organizations`, `projects`, `agents`, `workflows`, `importers`, plus `common` (shared utilities).

Each app follows identical sub-package structure:
- `models/` — Django ORM definitions
- `selectors/` — Read-only query functions (use select_related/prefetch_related, no writes)
- `services/` — Business logic, writes, wrapped in `transaction.atomic()`, emit WebSocket broadcasts
- `serializers/input.py` — Plain `serializers.Serializer` for validation only (never ModelSerializer)
- `serializers/output.py` — `ModelSerializer` with all fields as `read_only_fields`
- `views/` — Thin `APIView` subclasses, orchestrate selectors/services
- `permissions.py` — DRF permissions that also attach resolved objects to `request` (e.g., `request.organization`, `request.project`)

All models extend `common.BaseModel` (UUID pk, created_at, updated_at) except `User` (AbstractUser) and `IssueActivity` (no updated_at).

### Frontend (Next.js 15 / React 19)

App Router with two route groups:
- `(auth)/` — Login, Register (centered card layout)
- `(dashboard)/` — Flat routes with Sidebar wrapper (no org-scoping in URLs)

All pages are `"use client"` — no server components. Data fetching is client-side via `useEffect` + Axios.

Route structure uses flat paths with UUIDs:
- `/organizations`, `/organizations/[id]` — Org list, detail (6 tabs: general, members, settings, credentials, integrations, imports)
- `/projects`, `/projects/[id]`, `/projects/new` — Project list, detail, create
- `/projects/[id]/issues/[issueId]` — Issue detail
- `/teams`, `/teams/[id]` — Team list, detail
- `/labels` — Labels CRUD
- `/subagents`, `/skills`, `/workflows`, `/toony-agents` — AI Studio pages
- `/workflows/new` — Create workflow, `/workflows/[id]/edit` — DAG editor

Key infrastructure:
- `lib/api.ts` — Axios instance (`baseURL: /api`), JWT interceptor (silent 401 refresh + request queue)
- `lib/auth.ts` — Tokens in localStorage, cookie signal (`toony_authenticated`) for middleware
- `lib/roles.ts` — Client-side role hierarchy checks (OWNER > ADMIN > MANAGER > MEMBER > VIEWER)
- `contexts/auth-context.tsx` — AuthProvider at root layout

Path alias: `@/` maps to `frontend/` root (e.g., `@/lib/api`, `@/types`).

Tailwind CSS v4 — configured via `@import "tailwindcss"` in globals.css, no config file.

### Real-time

WebSocket via Django Channels + Redis. JWT passed as `?token=` query param. Frontend hooks: `useWebSocket` (core), `useProjectWebSocket`, `useAgentWebSocket`.

### Infrastructure

- Docker Compose: postgres:16, redis:7, backend (uvicorn --reload), frontend (next dev)
- Production: gunicorn + uvicorn workers, standalone Next.js, nginx reverse proxy
- CI: GitHub Actions — backend lint + test (with postgres service), frontend lint + build

## Environment Variables

Defined in `.env` (see `.env.example`):
- `SECRET_KEY`, `DEBUG`, `ENVIRONMENT`, `ALLOWED_HOSTS`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `REDIS_URL`, `CORS_ALLOWED_ORIGINS`, `FIELD_ENCRYPTION_KEY`
- `NEXT_PUBLIC_API_URL` (default: `http://localhost:8000/api`)
- `NEXT_PUBLIC_WS_URL` (default: `ws://localhost:8000`)
