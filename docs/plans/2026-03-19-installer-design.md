# Toony Self-Hosted Installer — Design

## Overview

A single `install.sh` bash script that allows end users to install and run Toony on a local machine with one command. A separate `uninstall.sh` handles cleanup.

**Target audience:** Self-hosters who want to run Toony locally without touching source code.

## User Experience

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/bikerlfh/toony-dev-core/main/install.sh | bash
```

### Uninstall

```bash
~/.toony/uninstall.sh
```

## Decisions

| Decision | Choice |
|---|---|
| Target audience | Self-hosters (not developers) |
| Prerequisites | Docker + Docker Compose only |
| Source delivery | GitHub release tarball (no git required) |
| Install location | `~/.toony/` |
| Secrets | Auto-generated (not prompted) |
| Superuser account | Prompted (email + password) |
| Demo data | Prompted (yes/no) |
| Uninstall | Separate `uninstall.sh` script |
| Distribution | `curl \| bash` one-liner |
| Port | User-prompted, default `18789` |

## Install Flow

1. Print banner (Toony name + version)
2. Check prerequisites:
   - `docker` command exists and daemon is running (`docker info`)
   - `docker compose` v2 plugin exists
   - `curl` or `wget` available
   - Target port is free (default 18789, user-configurable)
3. Download release tarball from GitHub → extract to `~/.toony/`
4. Auto-generate `.env.prod`:
   - `SECRET_KEY` — 50-char random via `openssl rand -base64 36`
   - `FIELD_ENCRYPTION_KEY` — separate random value, same method
   - `DB_PASSWORD` — 24-char random string
   - `DB_NAME=toony`, `DB_USER=toony`
   - `DEBUG=False`, `ENVIRONMENT=production`
   - `DB_HOST=db`, `DB_PORT=5432`
   - `REDIS_URL=redis://redis:6379/0`
   - `ALLOWED_HOSTS=localhost,127.0.0.1`
   - `CORS_ALLOWED_ORIGINS=http://localhost:<port>`
   - `NEXT_PUBLIC_API_URL=http://localhost:<port>/api`
5. Prompt for superuser email and password (reads from `/dev/tty`)
6. Prompt for port (default 18789)
7. Prompt whether to load demo data (y/N)
8. `docker compose -f docker-compose.prod.yml --env-file .env.prod build`
9. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`
10. Wait for postgres and redis to be healthy (poll, timeout 60s)
11. `docker compose exec backend python manage.py migrate`
12. `docker compose exec backend python manage.py createsuperuser --noinput` (via `DJANGO_SUPERUSER_EMAIL` and `DJANGO_SUPERUSER_PASSWORD` env vars)
13. If demo data: `docker compose exec backend sh -c 'python manage.py loaddata fixtures/*.json'`
14. Print success summary

## Docker Compose

Uses `docker-compose.prod.yml` (production stack):
- **nginx** — reverse proxy, bound to user-chosen port (default 18789)
- **backend** — gunicorn + uvicorn workers
- **frontend** — standalone Next.js
- **postgres** — 16-alpine, data in Docker volume
- **redis** — 7-alpine

Only the nginx port is exposed to the host. Postgres and Redis remain internal to the Docker network.

### Port Customization

The nginx port in `docker-compose.prod.yml` binds to port 80 inside the container. The installer overrides the host-side port by writing a `docker-compose.override.yml` (or using an environment variable) to map `<user-port>:80`.

## Uninstall Flow (`~/.toony/uninstall.sh`)

1. Check `~/.toony/` exists — exit with "Toony is not installed" if missing
2. Refuse to run if piped (prevent accidental uninstall)
3. Confirmation prompt: "This will stop all Toony services and delete all data. Continue? [y/N]"
4. `docker compose -f docker-compose.prod.yml --env-file .env.prod down -v`
5. Optionally remove Docker images built for Toony
6. `rm -rf ~/.toony/`
7. Print "Toony has been completely removed."

## Success Output

```
✅ Toony is up and running!

  URL:    http://localhost:18789
  Admin:  admin@example.com

  Uninstall:  ~/.toony/uninstall.sh

  Logs:       cd ~/.toony && docker compose -f docker-compose.prod.yml logs -f
  Stop:       cd ~/.toony && docker compose -f docker-compose.prod.yml stop
  Start:      cd ~/.toony && docker compose -f docker-compose.prod.yml up -d
```

## Compatibility

- **macOS** — Docker Desktop, OrbStack, Colima
- **Linux** — Docker Engine + Docker Compose v2 plugin
- **Windows** — Not directly supported; works inside WSL2 (documented)

## Files

| File | Location | Purpose |
|---|---|---|
| `install.sh` | Repo root (hosted on GitHub) | One-liner installer |
| `uninstall.sh` | Included in release tarball → `~/.toony/` | Cleanup script |
| `.env.prod` | Generated at `~/.toony/.env.prod` | Runtime configuration |
