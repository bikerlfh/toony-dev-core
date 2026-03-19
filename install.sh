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
HEALTH_TIMEOUT=60  # seconds

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
    local bytes="$1"
    openssl rand -base64 "$bytes" 2>/dev/null | tr -d '\n' || \
        head -c "$bytes" /dev/urandom | base64 | tr -d '\n' | head -c $(( (bytes * 4 + 2) / 3 ))
}

compose() {
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
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
        (cd "$INSTALL_DIR" && docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v 2>/dev/null || true)
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

    # Validate port is a number in valid range
    if ! [[ "$USER_PORT" =~ ^[0-9]+$ ]] || [ "$USER_PORT" -lt 1 ] || [ "$USER_PORT" -gt 65535 ]; then
        error "Invalid port number (must be 1-65535)."
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
    secret_key=$(generate_secret 36)
    field_encryption_key=$(generate_secret 32)
    db_password=$(generate_secret 24)

    cat > "$INSTALL_DIR/$ENV_FILE" <<EOF
# Auto-generated by Toony installer — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Do not commit this file.

# Django
SECRET_KEY="$secret_key"
DEBUG=False
ENVIRONMENT=production
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_NAME=toony
DB_USER=toony
DB_PASSWORD="$db_password"
DB_HOST=db
DB_PORT=5432

# Redis
REDIS_URL=redis://redis:6379/0

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:$USER_PORT

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:$USER_PORT/api

# Encryption
FIELD_ENCRYPTION_KEY="$field_encryption_key"

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
    compose build --quiet

    info "Starting services..."
    compose up -d
}

# ──────────────────────────────────────────────
# Wait for healthy services
# ──────────────────────────────────────────────

wait_for_services() {
    info "Waiting for services to be ready..."

    local elapsed=0
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        local db_healthy redis_healthy
        db_healthy=$(compose ps db --format '{{.Health}}' 2>/dev/null || echo "")
        redis_healthy=$(compose ps redis --format '{{.Health}}' 2>/dev/null || echo "")

        if [[ "$db_healthy" == *"healthy"* ]] && [[ "$redis_healthy" == *"healthy"* ]]; then
            success "All services are healthy."
            return 0
        fi

        sleep 2
        elapsed=$((elapsed + 2))
        printf "."
    done

    printf "\n"
    error "Services did not become healthy within ${HEALTH_TIMEOUT}s. Check logs with: cd ~/.toony && docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs"
}

# ──────────────────────────────────────────────
# Migrate & seed
# ──────────────────────────────────────────────

setup_database() {
    info "Running database migrations..."
    compose exec -T backend python manage.py migrate --noinput

    info "Creating admin user..."
    compose exec -T backend python manage.py shell -c "
from apps.accounts.models import User
if not User.objects.filter(username='${ADMIN_USERNAME}').exists():
    User.objects.create_superuser(
        username='${ADMIN_USERNAME}',
        email='${ADMIN_EMAIL}',
        password='${ADMIN_PASSWORD}',
        first_name='Admin',
        last_name='User',
    )
    print('Superuser created.')
else:
    print('Superuser already exists.')
"

    if [[ "$LOAD_DEMO" =~ ^[Yy]$ ]]; then
        info "Loading demo data..."
        compose exec -T backend sh -c 'python manage.py loaddata fixtures/*.json'
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
