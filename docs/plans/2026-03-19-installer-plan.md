# Toony Self-Hosted Installer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `curl | bash` installer that lets end users run Toony locally with Docker, plus a separate uninstall script.

**Architecture:** A single `install.sh` at repo root downloads a release tarball to `~/.toony/`, generates `.env.prod`, builds and starts the production Docker Compose stack, runs migrations, creates a superuser, and optionally loads demo data. A separate `uninstall.sh` (included in the tarball) tears everything down.

**Tech Stack:** Bash, Docker Compose, GitHub release tarballs.

---

### Task 1: Update `docker-compose.prod.yml` to support configurable nginx port

**Files:**
- Modify: `docker-compose.prod.yml:59-61` (nginx ports section)

**Step 1: Change the nginx port binding to use an environment variable**

In `docker-compose.prod.yml`, replace the hardcoded port `"80:80"` with `"${NGINX_PORT:-18789}:80"`. This allows the installer to set the host port via `.env.prod` while the container still listens on 80 internally.

```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "${NGINX_PORT:-18789}:80"
```

**Step 2: Verify the change is syntactically valid**

Run: `docker compose -f docker-compose.prod.yml config --quiet 2>&1 || echo "invalid"`

This will fail because required env vars are not set, but it should NOT fail on YAML syntax. If running locally with a `.env.prod` that has the required vars, it should succeed.

**Step 3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat(docker): make nginx port configurable via NGINX_PORT env var"
```

---

### Task 2: Create `uninstall.sh`

**Files:**
- Create: `uninstall.sh` (repo root — will be included in release tarballs)

**Step 1: Write the uninstall script**

```bash
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/.toony"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

# --- Helpers ---
info()  { printf "\033[1;34m→\033[0m %s\n" "$1"; }
error() { printf "\033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }

# --- Guards ---

# Refuse piped execution
if [ ! -t 0 ]; then
    error "uninstall.sh must be run directly, not piped. Run: ~/.toony/uninstall.sh"
fi

# Check installation exists
if [ ! -d "$INSTALL_DIR" ]; then
    error "Toony is not installed ($INSTALL_DIR does not exist)."
fi

# --- Confirmation ---

printf "\n\033[1;33m⚠  This will stop all Toony services and delete ALL data (database included).\033[0m\n"
read -rp "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

# --- Teardown ---

info "Stopping services and removing volumes..."
cd "$INSTALL_DIR"
if [ -f "$COMPOSE_FILE" ]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v 2>/dev/null || true
fi

info "Removing $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"

printf "\n\033[1;32m✓\033[0m Toony has been completely removed.\n"
```

**Step 2: Make executable and commit**

```bash
chmod +x uninstall.sh
git add uninstall.sh
git commit -m "feat(installer): add uninstall.sh for self-hosted cleanup"
```

---

### Task 3: Create `install.sh`

**Files:**
- Create: `install.sh` (repo root — hosted on GitHub for `curl | bash`)

This is the main installer script. It's broken into logical sections below.

**Step 1: Write the full install script**

The script has these sections in order:

1. **Configuration & constants** — version, repo URL, install dir, default port
2. **Helper functions** — `info`, `error`, `success`, `prompt`
3. **Prerequisite checks** — docker, docker compose, curl/wget
4. **Existing installation check** — if `~/.toony/` exists, ask to overwrite
5. **User prompts** — superuser credentials, port, demo data (all read from `/dev/tty`)
6. **Download & extract** — fetch release tarball, extract to `~/.toony/`
7. **Generate `.env.prod`** — auto-generate secrets, write config
8. **Build & start** — docker compose build + up
9. **Wait for healthy services** — poll until postgres/redis are ready
10. **Migrate & seed** — run migrations, create superuser, optionally load fixtures
11. **Success summary** — print URL, commands

```bash
#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────

VERSION="${TOONY_VERSION:-latest}"
REPO="bikerlfh/toony-dev-core"
INSTALL_DIR="$HOME/.toony"
DEFAULT_PORT=18789
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
HEALTH_TIMEOUT=120  # seconds

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

info()    { printf "\033[1;34m→\033[0m %s\n" "$1"; }
success() { printf "\033[1;32m✓\033[0m %s\n" "$1"; }
warn()    { printf "\033[1;33m⚠\033[0m %s\n" "$1"; }
error()   { printf "\033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }

banner() {
    printf "\n"
    printf "\033[1;36m"
    printf "  ╔════════════════════════════════╗\n"
    printf "  ║     Toony — Self-Hosted        ║\n"
    printf "  ║     Installer %-16s ║\n" "$VERSION"
    printf "  ╚════════════════════════════════╝\n"
    printf "\033[0m\n"
}

generate_secret() {
    openssl rand -base64 "$1" 2>/dev/null | tr -d '\n' || \
        head -c "$1" /dev/urandom | base64 | tr -d '\n/+=' | head -c "$1"
}

download() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$dest"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$url" -O "$dest"
    else
        error "Neither curl nor wget found."
    fi
}

# ──────────────────────────────────────────────
# Prerequisite checks
# ──────────────────────────────────────────────

check_prerequisites() {
    info "Checking prerequisites..."

    # curl or wget
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        error "curl or wget is required. Install one and retry."
    fi

    # docker
    if ! command -v docker >/dev/null 2>&1; then
        error "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
    fi

    # docker daemon running
    if ! docker info >/dev/null 2>&1; then
        error "Docker daemon is not running. Start Docker and retry."
    fi

    # docker compose v2
    if ! docker compose version >/dev/null 2>&1; then
        error "Docker Compose v2 is required. Install it from https://docs.docker.com/compose/install/"
    fi

    # openssl (for secret generation)
    if ! command -v openssl >/dev/null 2>&1; then
        warn "openssl not found — will use /dev/urandom for secret generation."
    fi

    success "All prerequisites met."
}

# ──────────────────────────────────────────────
# Existing installation check
# ──────────────────────────────────────────────

check_existing() {
    if [ -d "$INSTALL_DIR" ]; then
        warn "$INSTALL_DIR already exists."
        read -rp "Overwrite existing installation? [y/N] " confirm </dev/tty
        [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

        info "Stopping existing services..."
        cd "$INSTALL_DIR"
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v 2>/dev/null || true
        cd "$HOME"
        rm -rf "$INSTALL_DIR"
    fi
}

# ──────────────────────────────────────────────
# User prompts
# ──────────────────────────────────────────────

prompt_user() {
    printf "\n\033[1mSetup Configuration\033[0m\n\n"

    # Superuser email
    while true; do
        read -rp "Admin email: " ADMIN_EMAIL </dev/tty
        if [[ "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
            break
        fi
        warn "Please enter a valid email address."
    done

    # Superuser username (derived from email, user can override)
    local default_username="${ADMIN_EMAIL%%@*}"
    read -rp "Admin username [$default_username]: " ADMIN_USERNAME </dev/tty
    ADMIN_USERNAME="${ADMIN_USERNAME:-$default_username}"

    # Superuser password
    while true; do
        read -rsp "Admin password: " ADMIN_PASSWORD </dev/tty
        printf "\n"
        if [ ${#ADMIN_PASSWORD} -ge 8 ]; then
            break
        fi
        warn "Password must be at least 8 characters."
    done

    # Port
    read -rp "Port [$DEFAULT_PORT]: " USER_PORT </dev/tty
    USER_PORT="${USER_PORT:-$DEFAULT_PORT}"

    # Validate port is a number
    if ! [[ "$USER_PORT" =~ ^[0-9]+$ ]]; then
        error "Invalid port number."
    fi

    # Check port is free
    if command -v lsof >/dev/null 2>&1 && lsof -i :"$USER_PORT" >/dev/null 2>&1; then
        error "Port $USER_PORT is already in use."
    fi

    # Demo data
    read -rp "Load demo data? [y/N] " LOAD_DEMO </dev/tty
    LOAD_DEMO="${LOAD_DEMO:-N}"

    printf "\n"
}

# ──────────────────────────────────────────────
# Download & extract
# ──────────────────────────────────────────────

download_release() {
    info "Downloading Toony ($VERSION)..."

    local tarball_url
    if [ "$VERSION" = "latest" ]; then
        tarball_url="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
    else
        tarball_url="https://github.com/$REPO/archive/refs/tags/$VERSION.tar.gz"
    fi

    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' EXIT

    download "$tarball_url" "$tmp_dir/toony.tar.gz"

    info "Extracting..."
    mkdir -p "$INSTALL_DIR"
    tar -xzf "$tmp_dir/toony.tar.gz" -C "$INSTALL_DIR" --strip-components=1

    success "Extracted to $INSTALL_DIR"
}

# ──────────────────────────────────────────────
# Generate .env.prod
# ──────────────────────────────────────────────

generate_env() {
    info "Generating configuration..."

    local secret_key field_encryption_key db_password
    secret_key=$(generate_secret 50)
    field_encryption_key=$(generate_secret 44)
    db_password=$(generate_secret 24)

    cat > "$INSTALL_DIR/$ENV_FILE" <<EOF
# Auto-generated by Toony installer — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Do not commit this file.

# Django
SECRET_KEY=$secret_key
DEBUG=False
ENVIRONMENT=production
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_NAME=toony
DB_USER=toony
DB_PASSWORD=$db_password
DB_HOST=db
DB_PORT=5432

# Redis
REDIS_URL=redis://redis:6379/0

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:$USER_PORT

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:$USER_PORT/api

# Encryption
FIELD_ENCRYPTION_KEY=$field_encryption_key

# Nginx
NGINX_PORT=$USER_PORT
EOF

    success "Configuration written to $INSTALL_DIR/$ENV_FILE"
}

# ──────────────────────────────────────────────
# Build & start
# ──────────────────────────────────────────────

build_and_start() {
    cd "$INSTALL_DIR"

    info "Building containers (this may take a few minutes)..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --quiet

    info "Starting services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
}

# ──────────────────────────────────────────────
# Wait for healthy services
# ──────────────────────────────────────────────

wait_for_services() {
    info "Waiting for services to be ready..."

    local elapsed=0
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        local db_healthy redis_healthy
        db_healthy=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db --format '{{.Health}}' 2>/dev/null || echo "")
        redis_healthy=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps redis --format '{{.Health}}' 2>/dev/null || echo "")

        if [[ "$db_healthy" == *"healthy"* ]] && [[ "$redis_healthy" == *"healthy"* ]]; then
            success "All services are healthy."
            return 0
        fi

        sleep 2
        elapsed=$((elapsed + 2))
        printf "."
    done

    printf "\n"
    error "Services did not become healthy within ${HEALTH_TIMEOUT}s. Check logs: docker compose -f $COMPOSE_FILE logs"
}

# ──────────────────────────────────────────────
# Migrate & seed
# ──────────────────────────────────────────────

setup_database() {
    local compose_cmd="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

    info "Running database migrations..."
    $compose_cmd exec -T backend python manage.py migrate --noinput

    info "Creating admin user..."
    $compose_cmd exec -T \
        -e DJANGO_SUPERUSER_USERNAME="$ADMIN_USERNAME" \
        -e DJANGO_SUPERUSER_PASSWORD="$ADMIN_PASSWORD" \
        -e DJANGO_SUPERUSER_EMAIL="$ADMIN_EMAIL" \
        -e DJANGO_SUPERUSER_FIRST_NAME="Admin" \
        -e DJANGO_SUPERUSER_LAST_NAME="User" \
        backend python manage.py createsuperuser --noinput

    if [[ "$LOAD_DEMO" =~ ^[Yy]$ ]]; then
        info "Loading demo data..."
        $compose_cmd exec -T backend sh -c 'python manage.py loaddata fixtures/*.json'
        success "Demo data loaded."
    fi

    success "Database setup complete."
}

# ──────────────────────────────────────────────
# Success summary
# ──────────────────────────────────────────────

print_summary() {
    printf "\n"
    printf "\033[1;32m✅ Toony is up and running!\033[0m\n"
    printf "\n"
    printf "  \033[1mURL:\033[0m        http://localhost:%s\n" "$USER_PORT"
    printf "  \033[1mAdmin:\033[0m      %s (%s)\n" "$ADMIN_USERNAME" "$ADMIN_EMAIL"
    printf "\n"
    printf "  \033[1mUninstall:\033[0m  ~/.toony/uninstall.sh\n"
    printf "\n"
    printf "  \033[1mLogs:\033[0m       cd ~/.toony && docker compose -f %s --env-file %s logs -f\n" "$COMPOSE_FILE" "$ENV_FILE"
    printf "  \033[1mStop:\033[0m       cd ~/.toony && docker compose -f %s --env-file %s stop\n" "$COMPOSE_FILE" "$ENV_FILE"
    printf "  \033[1mStart:\033[0m      cd ~/.toony && docker compose -f %s --env-file %s up -d\n" "$COMPOSE_FILE" "$ENV_FILE"
    printf "\n"
}

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

main() {
    banner
    check_prerequisites
    check_existing
    prompt_user
    download_release
    generate_env
    build_and_start
    wait_for_services
    setup_database
    print_summary
}

main "$@"
```

**Key notes for the implementer:**

- All `read` prompts use `</dev/tty` so they work when the script is piped via `curl | bash`.
- `generate_secret` has a fallback to `/dev/urandom` if `openssl` is not available.
- The `DJANGO_SUPERUSER_FIRST_NAME` and `DJANGO_SUPERUSER_LAST_NAME` env vars are needed because the User model has `REQUIRED_FIELDS = ["first_name", "last_name"]`. We hardcode "Admin" / "User" since they're not important for self-hosters.
- The `-T` flag on `docker compose exec` disables TTY allocation, which is needed since the script may run non-interactively at that point.
- The `trap` in `download_release` cleans up the temp directory even on failure.

**Step 2: Make executable and commit**

```bash
chmod +x install.sh
git add install.sh
git commit -m "feat(installer): add self-hosted install.sh for curl | bash setup"
```

---

### Task 4: Update `docker-compose.prod.yml` for `NGINX_PORT` and superuser env vars

**Files:**
- Modify: `docker-compose.prod.yml:59-61`

**Step 1: Update nginx port binding**

Change:
```yaml
    ports:
      - "80:80"
```

To:
```yaml
    ports:
      - "${NGINX_PORT:-18789}:80"
```

**Step 2: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat(docker): make nginx port configurable via NGINX_PORT env var"
```

> **Note:** Tasks 1 and 4 overlap — they are the same change. The implementer should only do this once (in Task 1 or Task 4, not both). Task 1 is listed first so it should be done there.

---

### Task 5: End-to-end manual test

**Step 1: Verify install script syntax**

Run: `bash -n install.sh && echo "OK" || echo "SYNTAX ERROR"`

Expected: `OK`

**Step 2: Verify uninstall script syntax**

Run: `bash -n uninstall.sh && echo "OK" || echo "SYNTAX ERROR"`

Expected: `OK`

**Step 3: Test the full install flow (requires Docker running)**

```bash
# Simulate what curl | bash would do
bash install.sh
```

Provide test inputs when prompted:
- Admin email: `test@toony.local`
- Admin username: (accept default `test`)
- Admin password: `testpass123`
- Port: (accept default `18789`)
- Load demo data: `y`

Expected: Script completes, prints success summary with `http://localhost:18789`.

**Step 4: Verify the app is accessible**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:18789`

Expected: `200` (or `301`/`302` redirect to login)

**Step 5: Verify superuser can log in**

Run:
```bash
curl -s -X POST http://localhost:18789/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "testpass123"}'
```

Expected: JSON response with `access` and `refresh` tokens.

**Step 6: Test uninstall**

Run: `~/.toony/uninstall.sh`

Confirm with `y`. Expected: Services stop, `~/.toony/` removed, success message printed.

Verify: `ls ~/.toony 2>&1` should output "No such file or directory".

**Step 7: Commit all files together**

If all tests pass and scripts needed adjustments, commit any fixes:

```bash
git add install.sh uninstall.sh docker-compose.prod.yml
git commit -m "feat(installer): add self-hosted installer and uninstall scripts

- Add install.sh: curl | bash installer that downloads release, generates env, builds and starts Docker stack
- Add uninstall.sh: stops services, removes volumes and install directory
- Make nginx port configurable via NGINX_PORT env var (default 18789)"
```
