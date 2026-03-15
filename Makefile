.PHONY: help build up down up-backend up-frontend logs logs-backend logs-frontend \
       makemigrations migrate createsuperuser shell reset-db reset-migrations \
       dumpdata loaddata test lint format format-check \
       build-prod up-prod down-prod \
       clean

COMPOSE = docker compose
COMPOSE_PROD = docker compose -f docker-compose.prod.yml
BACKEND = $(COMPOSE) exec backend
MANAGE = $(BACKEND) python manage.py

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────────
# Development
# ──────────────────────────────────────────────

build: ## Build all dev containers
	$(COMPOSE) build

up: ## Start all dev services
	$(COMPOSE) up -d

down: ## Stop all dev services
	$(COMPOSE) down

up-backend: ## Start backend + db + redis only
	$(COMPOSE) up -d postgres redis backend

up-frontend: ## Start frontend only
	$(COMPOSE) up -d frontend

restart: ## Restart all dev services
	$(COMPOSE) restart

logs: ## Tail logs for all services
	$(COMPOSE) logs -f

logs-backend: ## Tail backend logs
	$(COMPOSE) logs -f backend

logs-frontend: ## Tail frontend logs
	$(COMPOSE) logs -f frontend

# ──────────────────────────────────────────────
# Django management
# ──────────────────────────────────────────────

makemigrations: ## Create new migrations
	$(MANAGE) makemigrations

migrate: ## Apply migrations
	$(MANAGE) migrate

createsuperuser: ## Create a Django superuser
	$(MANAGE) createsuperuser

shell: ## Open Django shell
	$(MANAGE) shell

collectstatic: ## Collect static files
	$(MANAGE) collectstatic --noinput

## Dump data to app/fixtures/: make dumpdata app="applications" outname="apps"
dumpdata:
	$(MANAGE) dumpdata $(app) --indent 2 --output fixtures/$(outname).json

dumpdata-all:
	$(MANAGE) dumpdata accounts --indent 2 --output fixtures/accounts.json
	$(MANAGE) dumpdata organizations --indent 2 --output fixtures/organizations.json
	$(MANAGE) dumpdata projects --indent 2 --output fixtures/projects.json
	$(MANAGE) dumpdata workspace --indent 2 --output fixtures/workspace.json
	$(MANAGE) dumpdata agents --indent 2 --output fixtures/agents.json
	$(MANAGE) dumpdata workflows --indent 2 --output fixtures/workflows.json
	$(MANAGE) dumpdata toony_agents.toonyagent --indent 2 --output fixtures/toony_agents.json
	$(MANAGE) dumpdata importers --indent 2 --output fixtures/importers.json
	$(MANAGE) dumpdata common --indent 2 --output fixtures/common.json

## Load fixture: make loaddata file="all" (loads fixtures/<file>.json)
loaddata:
	$(BACKEND) sh -c 'python manage.py loaddata fixtures/*.json'

## Delete all migration files and regenerate them (destructive!)
reset-migrations:
	$(BACKEND) find apps/accounts apps/organizations apps/projects apps/workspace apps/agents apps/workflows apps/toony_agents apps/importers \
		-path "*/migrations/[0-9]*.py" -delete
	$(MANAGE) makemigrations accounts organizations projects workspace agents workflows toony_agents importers

# ──────────────────────────────────────────────
# Testing & quality
# ──────────────────────────────────────────────

test: ## Run backend tests
	$(BACKEND) pytest -v

test-cov: ## Run backend tests with coverage
	$(BACKEND) pytest --cov --cov-report=term-missing

lint: ## Run ruff linter
	$(BACKEND) ruff check . --fix

format: ## Format backend code with ruff
	$(BACKEND) ruff format .

format-check: ## Check backend formatting (dry run)
	$(BACKEND) ruff format --check .

lint-frontend: ## Run Next.js linter
	$(COMPOSE) exec frontend npm run lint

run-toony-agent: ## Run Toony Agent
	cd toony_agent_runner && toony-agent-runner --config config.yml

# ──────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────

reset-db: ## Drop and recreate the database (destructive!)
	$(COMPOSE) down -v
	$(COMPOSE) up -d postgres redis
	@echo "Waiting for database..."
	@sleep 3
	$(COMPOSE) up -d backend
	@sleep 5
	$(MANAGE) migrate
	@echo "Database reset complete."

dbshell: ## Open psql shell
	$(COMPOSE) exec postgres psql -U $${DB_USER:-postgres} -d $${DB_NAME:-toony_dev}

# ──────────────────────────────────────────────
# Production
# ──────────────────────────────────────────────

build-prod: ## Build production containers
	$(COMPOSE_PROD) build

up-prod: ## Start production services
	$(COMPOSE_PROD) up -d

down-prod: ## Stop production services
	$(COMPOSE_PROD) down

logs-prod: ## Tail production logs
	$(COMPOSE_PROD) logs -f

ssh-add:
	sudo ssh-add ~/.ssh/id_bitbucket

# ──────────────────────────────────────────────
# Cleanup
# ──────────────────────────────────────────────

clean: ## Remove containers, volumes, and build artifacts
	$(COMPOSE) down -v --remove-orphans
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/.pytest_cache backend/htmlcov backend/.coverage
	rm -rf frontend/.next frontend/node_modules/.cache
