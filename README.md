# Toony Dev Core

Full-stack project management application with AI agent automation. Django 5 + DRF backend, Next.js 15 + React 19 frontend, orchestrated with Docker Compose.

## Self-Hosted Install

Run Toony locally with a single command. Requires [Docker](https://docs.docker.com/get-docker/) with Compose v2.

```bash
curl -fsSL https://raw.githubusercontent.com/bikerlfh/toony-dev-core/main/install.sh | bash
```

The installer will prompt for:
- Admin email, username, and password
- Port (default: `18789`)
- Whether to load demo data

Once complete, the app is available at `http://localhost:18789`.

To install a specific version:

```bash
TOONY_VERSION=v1.0.0 bash <(curl -fsSL https://raw.githubusercontent.com/bikerlfh/toony-dev-core/main/install.sh)
```

### Managing the installation

```bash
toony start         # Start all services
toony stop          # Stop all services
toony restart       # Restart all services
toony logs          # Tail all logs (or: toony logs backend)
toony status        # Show service status
```

### Agent Runner

Configure and run a [Toony Agent Runner](toony_agent_runner/) to connect Claude Code agents to your Toony instance:

```bash
toony runner config     # Interactive wizard: name, API key, workspace root, permission mode
toony runner start      # Start a runner (lists available configs if multiple)
toony runner start bot  # Start a specific runner by name
```

Runner configs are stored in `~/.toony/runners/` and survive `toony update`.

### Backup & Restore

```bash
toony backup            # Create a backup in ~/.toony/backups/
toony backup --list     # List existing backups
```

To restore a backup during installation:

```bash
# Auto-detect the most recent backup
install.sh --local . --restore

# Or specify a backup file
install.sh --local . --restore ~/toony-backup-2026-03-21T15-30-00.sql
```

### Uninstall

```bash
toony uninstall
```

The uninstaller will offer to backup the database before removing everything. If accepted, the backup is saved to `~/toony-backup-<timestamp>.sql` (outside `~/.toony/` so it survives deletion).

## Development Setup

```bash
cp .env.example .env    # configure environment variables
make up                 # start all services (postgres, redis, backend, frontend)
make migrate            # run database migrations
```

The app will be available at `http://localhost:4000` (frontend) and `http://localhost:8080` (backend API).

## Commands

```bash
make up                 # Start all services
make down               # Stop all services
make up-backend         # Start backend stack only (postgres + redis + backend)
make logs-backend       # Tail backend logs
make logs-frontend      # Tail frontend logs

make migrate            # Run Django migrations
make makemigrations     # Generate new migrations
make loaddata file="all" # Load fixture data

make test               # Run backend tests
make test-cov           # Run tests with coverage
make lint               # Backend linting (ruff)
make lint-frontend      # Frontend linting (next lint)

make shell              # Django shell
make dbshell            # psql shell
make reset-db           # Drop volumes, recreate DB, re-migrate
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Django secret key | *(required)* |
| `DEBUG` | Debug mode | `True` |
| `ENVIRONMENT` | `development` or `production` | `development` |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts | `localhost,127.0.0.1` |
| `DB_NAME` | PostgreSQL database name | `toony_dev` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_HOST` | PostgreSQL host | `db` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379/0` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000` |
| `FIELD_ENCRYPTION_KEY` | Key for encrypted model fields | *(required)* |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL | `http://localhost:8000/api` |
| `NEXT_PUBLIC_WS_URL` | Frontend WebSocket URL | `ws://localhost:8000` |
| `DEFAULT_AGENT_TASK_PROMPT_TEMPLATE` | Default prompt template for auto-created agent tasks | `Use toony skill and implement {issue_identifier}` |

### Agent Task Automation

When an issue transitions from **BACKLOG** to **TODO**, the system automatically creates an AgentTask assigned to the most recently connected ToonyAgent in the issue's organization.

The prompt for the auto-created task is resolved from:

1. **Project-level override** — `ProjectSettings.auto_task_prompt_template` (configurable via API at `PATCH /api/projects/<id>/settings/`)
2. **Global default** — `DEFAULT_AGENT_TASK_PROMPT_TEMPLATE` environment variable

Supported template variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `{issue_id}` | Issue UUID | `a1b2c3d4-...` |
| `{issue_identifier}` | Human-readable identifier | `ENG-42` |
| `{issue_description}` | Issue description text | `Fix the login bug...` |

Example configurations:

```bash
# Default
DEFAULT_AGENT_TASK_PROMPT_TEMPLATE="Use toony skill and implement {issue_identifier}"

# Custom
DEFAULT_AGENT_TASK_PROMPT_TEMPLATE="Analyze and implement issue {issue_identifier} (ID: {issue_id})"
```

If neither the project setting nor the environment variable is configured (empty string), no agent task is created automatically.

## Project Structure

```
backend/          # Django 5 + DRF
  apps/
    accounts/     # Auth, users, memberships
    organizations/# Orgs, settings, credentials
    projects/     # Projects, issues, milestones, cycles
    workspace/    # Teams, labels
    agents/       # SubAgents, skills
    workflows/    # Workflow DAGs
    toony_agents/ # ToonyAgents, agent tasks
    importers/    # External project importers
    common/       # Shared utilities
  config/         # Django settings
  tests/          # pytest + factory_boy

frontend/         # Next.js 15 + React 19
  app/            # App Router (all client components)
  components/     # Shared UI components
  lib/            # API client, auth, utilities
  contexts/       # React context providers
  types/          # TypeScript type definitions
```
