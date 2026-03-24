#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────

VERSION="${TOONY_VERSION:-latest}"
REPO="bikerlfh/toony-dev-core"
INSTALL_DIR="$HOME/.toony"
APP_DIR="$INSTALL_DIR/app"
DEFAULT_PORT=18789
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="$INSTALL_DIR/.env.prod"
META_FILE="$INSTALL_DIR/.install-meta"
HEALTH_TIMEOUT=60  # seconds
LOCAL_DIR=""
RESTORE_FILE=""

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
    cd "$APP_DIR"
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

find_latest_backup() {
    local latest=""
    local latest_time=0
    local backup_dir="$INSTALL_DIR/backups/db"

    if [ -d "$backup_dir" ]; then
        for f in "$backup_dir"/toony-backup-*.sql; do
            [ -f "$f" ] || continue
            local mtime
            mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
            if [ "$mtime" -gt "$latest_time" ]; then
                latest_time="$mtime"
                latest="$f"
            fi
        done
    fi

    echo "$latest"
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
    if [ -d "$APP_DIR" ]; then
        warn "Existing installation found."
        read -rp "Overwrite existing installation? [y/N] " confirm </dev/tty
        [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

        info "Stopping existing services..."
        (cd "$APP_DIR" 2>/dev/null && docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v 2>/dev/null || true)
        rm -rf "$APP_DIR"
        rm -f "$ENV_FILE"
    fi
}

# ──────────────────────────────────────────────
# User prompts
# ──────────────────────────────────────────────

prompt_user() {
    printf "\n\033[1mSetup Configuration\033[0m\n\n"

    # Port (always asked)
    read -rp "Port [$DEFAULT_PORT]: " USER_PORT </dev/tty
    USER_PORT="${USER_PORT:-$DEFAULT_PORT}"

    # Validate port is a number in valid range
    if ! [[ "$USER_PORT" =~ ^[0-9]+$ ]] || [ "$USER_PORT" -lt 1 ] || [ "$USER_PORT" -gt 65535 ]; then
        error "Invalid port number (must be 1-65535)."
    fi

    # Check port is free (ignore sockets in closing states like FIN_WAIT/CLOSE_WAIT)
    if command -v lsof >/dev/null 2>&1 && lsof -i :"$USER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        error "Port $USER_PORT is already in use."
    fi

    # Skip admin/demo prompts when restoring from backup
    if [ -n "$RESTORE_FILE" ]; then
        printf "\n"
        return
    fi

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

    # Demo data
    read -rp "Load demo data? [y/N] " LOAD_DEMO </dev/tty
    LOAD_DEMO="${LOAD_DEMO:-N}"

    printf "\n"
}

# ──────────────────────────────────────────────
# Download & extract (or copy from local)
# ──────────────────────────────────────────────

copy_local() {
    info "Copying from local directory ($LOCAL_DIR)..."

    mkdir -p "$APP_DIR"
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
        --exclude='__pycache__' --exclude='.env' --exclude='.env.prod' \
        "$LOCAL_DIR/" "$APP_DIR/"

    success "Copied to $APP_DIR"
}

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
    mkdir -p "$APP_DIR"
    tar -xzf "$tmp_dir/toony.tar.gz" -C "$APP_DIR" --strip-components=1

    success "Extracted to $APP_DIR"
}

fetch_source() {
    if [ -n "$LOCAL_DIR" ]; then
        copy_local
    else
        download_release
    fi
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

    cat > "$ENV_FILE" <<EOF
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

    success "Configuration written to $ENV_FILE"
}

# ──────────────────────────────────────────────
# Build & start
# ──────────────────────────────────────────────

build_and_start() {
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

restore_database() {
    info "Restoring database from $RESTORE_FILE..."

    local db_user db_name
    db_user=$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2)
    db_name=$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2)

    compose exec -T db psql -U "$db_user" "$db_name" < "$RESTORE_FILE"

    success "Database restored from $RESTORE_FILE"
}

# ──────────────────────────────────────────────
# Install CLI command
# ──────────────────────────────────────────────

install_cli() {
    # Copy CLI scripts from app to install root
    cp "$APP_DIR/toony.sh" "$INSTALL_DIR/toony.sh"
    cp "$APP_DIR/uninstall.sh" "$INSTALL_DIR/uninstall.sh"
    chmod +x "$INSTALL_DIR/toony.sh" "$INSTALL_DIR/uninstall.sh"

    local bin_dir="$HOME/.local/bin"
    mkdir -p "$bin_dir"
    ln -sf "$INSTALL_DIR/toony.sh" "$bin_dir/toony"

    # Check if ~/.local/bin is in PATH
    if ! echo "$PATH" | tr ':' '\n' | grep -qx "$bin_dir"; then
        warn "$bin_dir is not in your PATH."
        printf "     Add it by running:\n"
        printf "     \033[1mexport PATH=\"\$HOME/.local/bin:\$PATH\"\033[0m\n"
        printf "     Then add that line to your ~/.zshrc or ~/.bashrc\n\n"
    else
        success "Installed 'toony' command."
    fi
}

# ──────────────────────────────────────────────
# Write installation metadata
# ──────────────────────────────────────────────

write_meta() {
    local source="remote"
    local local_path=""

    if [ -n "$LOCAL_DIR" ]; then
        source="local"
        local_path="$LOCAL_DIR"
    fi

    cat > "$META_FILE" <<EOF
SOURCE=$source
LOCAL_PATH=$local_path
INSTALLED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
UPDATED_AT=
EOF

    success "Installation metadata saved."
}

# ──────────────────────────────────────────────
# Success summary
# ──────────────────────────────────────────────

print_summary() {
    printf "\n"
    printf "\033[1;32m✅ Toony is up and running!\033[0m\n"
    printf "\n"
    printf "  \033[1mURL:\033[0m        http://localhost:%s\n" "$USER_PORT"
    if [ -n "${ADMIN_USERNAME:-}" ]; then
        printf "  \033[1mAdmin:\033[0m      %s (%s)\n" "$ADMIN_USERNAME" "$ADMIN_EMAIL"
    fi
    printf "\n"
    printf "  \033[1mManage:\033[0m     toony start | stop | restart | logs | status\n"
    printf "  \033[1mUpdate:\033[0m     toony update\n"
    printf "  \033[1mUninstall:\033[0m  toony uninstall\n"
    printf "\n"
}

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

# ──────────────────────────────────────────────
# Argument parsing
# ──────────────────────────────────────────────

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --local)
                LOCAL_DIR="${2:?--local requires a path argument}"
                LOCAL_DIR="$(cd "$LOCAL_DIR" && pwd)"  # resolve to absolute path
                [ -f "$LOCAL_DIR/docker-compose.prod.yml" ] || error "--local path must point to the toony-dev-core repo root."
                VERSION="local"
                shift 2
                ;;
            --restore)
                if [ $# -ge 2 ] && [[ ! "$2" =~ ^-- ]]; then
                    RESTORE_FILE="$2"
                    [ -f "$RESTORE_FILE" ] || error "Restore file not found: $RESTORE_FILE"
                    RESTORE_FILE="$(cd "$(dirname "$RESTORE_FILE")" && pwd)/$(basename "$RESTORE_FILE")"
                    shift 2
                else
                    # Auto-detect: find most recent backup
                    RESTORE_FILE="__auto__"
                    shift
                fi
                ;;
            --help|-h)
                printf "Usage: install.sh [--local PATH] [--restore [FILE]]\n\n"
                printf "Options:\n"
                printf "  --local PATH       Install from a local repo checkout instead of downloading\n"
                printf "  --restore [FILE]   Restore database from backup (auto-detects latest if no file given)\n"
                printf "  --help             Show this help\n"
                exit 0
                ;;
            *)
                error "Unknown argument: $1. Use --help for usage."
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    banner
    check_prerequisites
    check_existing
    prompt_user
    fetch_source
    generate_env
    build_and_start
    wait_for_services

    if [ -n "$RESTORE_FILE" ]; then
        # Resolve auto-detect
        if [ "$RESTORE_FILE" = "__auto__" ]; then
            RESTORE_FILE=$(find_latest_backup)
            [ -n "$RESTORE_FILE" ] || error "No backup files found to restore."
            info "Found backup: $RESTORE_FILE"
        fi
        # Run migrations first (schema must exist), then restore data
        info "Running database migrations..."
        compose exec -T backend python manage.py migrate --noinput
        restore_database
    else
        setup_database
    fi

    install_cli
    write_meta
    print_summary
}

main "$@"
