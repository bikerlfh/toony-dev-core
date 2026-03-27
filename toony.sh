#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/.toony"
APP_DIR="$INSTALL_DIR/app"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="$INSTALL_DIR/.env.prod"
BACKUP_DIR="$INSTALL_DIR/backups/db"
META_FILE="$INSTALL_DIR/.install-meta"
REPO="bikerlfh/toony-dev-core"
HEALTH_TIMEOUT=60
RUNNERS_DIR="$INSTALL_DIR/runners"
RUNNERS_VENV="$RUNNERS_DIR/venv"
RUNNER_MODULE_DIR="$APP_DIR/toony_agent_runner"

# --- Helpers ---
info()    { printf "\033[1;34m→\033[0m %s\n" "$1"; }
success() { printf "\033[1;32m✓\033[0m %s\n" "$1"; }
error()   { printf "\033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }
warn()    { printf "\033[1;33m⚠\033[0m %s\n" "$1"; }

# --- Guard ---
if [ ! -d "$INSTALL_DIR" ]; then
    error "Toony is not installed ($INSTALL_DIR does not exist)."
fi

compose() {
    cd "$APP_DIR"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# --- Commands ---

cmd_start() {
    info "Starting Toony..."
    compose up -d
    success "Toony is running at http://localhost:$(grep -E '^NGINX_PORT=' "$ENV_FILE" | cut -d= -f2)"
}

cmd_stop() {
    info "Stopping Toony..."
    compose stop
    success "Toony stopped."
}

cmd_restart() {
    info "Restarting Toony..."
    compose restart
    success "Toony restarted."
}

cmd_logs() {
    compose logs -f "$@"
}

cmd_status() {
    compose ps
}

cmd_backup() {
    local subcmd="${1:-}"

    if [ "$subcmd" = "--list" ]; then
        if [ -d "$BACKUP_DIR" ] && ls "$BACKUP_DIR"/*.sql >/dev/null 2>&1; then
            printf "\033[1mBackups in %s:\033[0m\n\n" "$BACKUP_DIR"
            ls -lh "$BACKUP_DIR"/*.sql
        else
            info "No backups found."
        fi
        return
    fi

    # Check db container is running
    if ! compose ps db --format '{{.State}}' 2>/dev/null | grep -q "running"; then
        error "Database container is not running. Start Toony first: toony start"
    fi

    mkdir -p "$BACKUP_DIR"
    local timestamp
    timestamp=$(date +"%Y-%m-%dT%H-%M-%S")
    local backup_file="$BACKUP_DIR/toony-backup-${timestamp}.sql"

    local db_user db_name
    db_user=$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2)
    db_name=$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2)

    info "Creating backup..."
    compose exec -T db pg_dump --data-only -U "$db_user" "$db_name" > "$backup_file"

    local size
    size=$(ls -lh "$backup_file" | awk '{print $5}')
    success "Backup saved to $backup_file ($size)"
}

cmd_update() {
    local use_local="" no_backup=false

    # Parse flags
    while [ $# -gt 0 ]; do
        case "$1" in
            --local)
                use_local="${2:?--local requires a path argument}"
                use_local="$(cd "$use_local" && pwd)"
                [ -f "$use_local/docker-compose.prod.yml" ] || error "--local path must point to the toony-dev-core repo root."
                shift 2
                ;;
            --no-backup)
                no_backup=true
                shift
                ;;
            *)
                error "Unknown flag: $1. Usage: toony update [--local PATH] [--no-backup]"
                ;;
        esac
    done

    # Resolve source from metadata if no --local flag
    if [ -z "$use_local" ] && [ -f "$META_FILE" ]; then
        local meta_source meta_local_path
        meta_source=$(grep -E '^SOURCE=' "$META_FILE" | cut -d= -f2)
        meta_local_path=$(grep -E '^LOCAL_PATH=' "$META_FILE" | cut -d= -f2)

        if [ "$meta_source" = "local" ] && [ -n "$meta_local_path" ]; then
            if [ -d "$meta_local_path" ]; then
                use_local="$meta_local_path"
                info "Using local source from metadata: $use_local"
            else
                warn "Local path from metadata no longer exists: $meta_local_path"
                warn "Falling back to remote (GitHub)."
            fi
        fi
    fi

    # Verify Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker daemon is not running. Start Docker and retry."
    fi

    # Backup database (only if db container is running)
    if [ "$no_backup" = false ]; then
        if compose ps db --format '{{.State}}' 2>/dev/null | grep -q "running"; then
            info "Backing up database before update..."
            cmd_backup
            printf "\n"
        else
            warn "Database is not running — skipping backup."
        fi
    else
        warn "Skipping database backup (--no-backup)."
    fi

    # Fetch new code to a temp directory
    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' RETURN

    if [ -n "$use_local" ]; then
        info "Copying from local directory ($use_local)..."
        rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
            --exclude='__pycache__' --exclude='.env' --exclude='.env.prod' \
            "$use_local/" "$tmp_dir/"
        success "Copied to temp directory."
    else
        info "Downloading latest version from GitHub..."
        local tarball_url="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
        local archive="$tmp_dir/toony.tar.gz"

        if command -v curl >/dev/null 2>&1; then
            curl -fsSL "$tarball_url" -o "$archive"
        elif command -v wget >/dev/null 2>&1; then
            wget -q "$tarball_url" -O "$archive"
        else
            error "Neither curl nor wget found."
        fi

        local extract_dir="$tmp_dir/extracted"
        mkdir -p "$extract_dir"
        tar -xzf "$archive" -C "$extract_dir" --strip-components=1
        # Move extracted content to tmp_dir root for consistent path
        rsync -a "$extract_dir/" "$tmp_dir/" && rm -rf "$extract_dir" "$archive"
        success "Downloaded and extracted."
    fi

    # Stop services
    info "Stopping services..."
    compose stop

    # Replace app directory
    info "Replacing application files..."
    rm -rf "$APP_DIR"
    mkdir -p "$APP_DIR"
    rsync -a "$tmp_dir/" "$APP_DIR/"
    success "Application files updated."

    # Rebuild containers
    info "Rebuilding containers (this may take a few minutes)..."
    compose build --quiet

    # Start services
    info "Starting services..."
    compose up -d

    # Wait for healthy
    info "Waiting for services to be ready..."
    local elapsed=0
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        local db_healthy redis_healthy
        db_healthy=$(compose ps db --format '{{.Health}}' 2>/dev/null || echo "")
        redis_healthy=$(compose ps redis --format '{{.Health}}' 2>/dev/null || echo "")

        if [[ "$db_healthy" == *"healthy"* ]] && [[ "$redis_healthy" == *"healthy"* ]]; then
            success "All services are healthy."
            break
        fi

        sleep 2
        elapsed=$((elapsed + 2))
        printf "."
    done

    if [ $elapsed -ge $HEALTH_TIMEOUT ]; then
        printf "\n"
        error "Services did not become healthy within ${HEALTH_TIMEOUT}s. Check: toony logs"
    fi

    # Run migrations
    info "Running database migrations..."
    if ! compose exec -T backend python manage.py migrate --noinput; then
        printf "\n"
        warn "Migrations failed! Your database may be in an inconsistent state."
        warn "A backup was created before the update. Restore it with:"
        printf "     \033[1mtoony backup --list\033[0m  (to find the backup file)\n"
        printf "     Then reinstall with: \033[1minstall.sh --restore <backup-file>\033[0m\n"
        exit 1
    fi
    success "Migrations applied."

    # Update metadata
    if [ -f "$META_FILE" ]; then
        local new_source="remote"
        local new_local_path=""
        if [ -n "$use_local" ]; then
            new_source="local"
            new_local_path="$use_local"
        fi

        local installed_at
        installed_at=$(grep -E '^INSTALLED_AT=' "$META_FILE" | cut -d= -f2)

        cat > "$META_FILE" <<EOF
SOURCE=$new_source
LOCAL_PATH=$new_local_path
INSTALLED_AT=${installed_at}
UPDATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
    fi

    # Reinstall CLI scripts
    cp "$APP_DIR/toony.sh" "$INSTALL_DIR/toony.sh"
    cp "$APP_DIR/uninstall.sh" "$INSTALL_DIR/uninstall.sh"
    chmod +x "$INSTALL_DIR/toony.sh" "$INSTALL_DIR/uninstall.sh"
    success "CLI scripts updated."

    # Summary
    local port
    port=$(grep -E '^NGINX_PORT=' "$ENV_FILE" | cut -d= -f2)
    printf "\n"
    printf "\033[1;32m✅ Toony has been updated successfully!\033[0m\n"
    printf "\n"
    printf "  \033[1mURL:\033[0m  http://localhost:%s\n" "$port"
    printf "\n"
}

runner_config() {
    # Prompt for runner name
    printf "Runner name: "
    read -r runner_name
    if [ -z "$runner_name" ]; then
        error "Runner name cannot be empty."
    fi

    # Sanitize: only allow alphanumeric, hyphens, underscores
    if ! echo "$runner_name" | grep -qE '^[a-zA-Z0-9_-]+$'; then
        error "Runner name can only contain letters, numbers, hyphens, and underscores."
    fi

    mkdir -p "$RUNNERS_DIR"
    local config_file="$RUNNERS_DIR/${runner_name}.yml"

    if [ -f "$config_file" ]; then
        error "Runner '$runner_name' already exists at $config_file. Edit it manually to reconfigure."
    fi

    # Prompt for API key
    printf "API key: "
    read -r api_key
    if [ -z "$api_key" ]; then
        error "API key cannot be empty."
    fi

    # Prompt for workspace_root
    printf "Workspace root [~/work]: "
    read -r workspace_root
    if [ -z "$workspace_root" ]; then
        workspace_root="~/work"
    fi

    # Prompt for permission_mode
    printf "Permission mode [bypassPermissions]: "
    read -r permission_mode
    if [ -z "$permission_mode" ]; then
        permission_mode="bypassPermissions"
    fi

    # Auto-resolve backend_url from .env.prod
    local port
    port=$(grep -E '^NGINX_PORT=' "$ENV_FILE" | cut -d= -f2)
    if [ -z "$port" ]; then
        port="18789"
        warn "NGINX_PORT not found in .env.prod, using default: $port"
    fi
    local backend_url="ws://localhost:${port}/ws/toony-agents/runner/"

    # Generate config YAML
    cat > "$config_file" <<EOF
backend_url: "${backend_url}"
api_key: "${api_key}"

workspace_root: "${workspace_root}"

clone_protocol: "ssh"

claude:
  binary: "claude"
  output_format: "stream-json"
  working_directory: "."
  max_task_timeout: 3600
  approval_timeout: 600
  max_concurrent_tasks: 1
  permission_mode: "${permission_mode}"

reconnect:
  max_retries: -1
  backoff_base: 1
  backoff_max: 30
EOF

    printf "\n"
    success "Runner '$runner_name' configured at $config_file"
    info "To start it: toony runner start $runner_name"
    info "To customize: edit $config_file"
}

ensure_runner_venv() {
    if ! command -v python3 >/dev/null 2>&1; then
        error "python3 is required but not found. Install Python 3.11+ and retry."
    fi

    if [ ! -d "$RUNNERS_VENV" ] || [ ! -x "$RUNNERS_VENV/bin/python" ]; then
        info "Creating runner virtual environment..."
        python3 -m venv "$RUNNERS_VENV"
    fi

    # Always ensure dependencies are up to date.
    "$RUNNERS_VENV/bin/pip" install --quiet websockets pyyaml rich
}

runner_start() {
    local runner_name="${1:-}"
    local config_file=""

    if [ -n "$runner_name" ]; then
        # Direct name provided
        config_file="$RUNNERS_DIR/${runner_name}.yml"
        if [ ! -f "$config_file" ]; then
            error "Runner config not found: $config_file"
        fi
    else
        # List available configs
        if [ ! -d "$RUNNERS_DIR" ] || ! ls "$RUNNERS_DIR"/*.yml >/dev/null 2>&1; then
            error "No runners configured. Run: toony runner config"
        fi

        local configs=()
        for f in "$RUNNERS_DIR"/*.yml; do
            configs+=("$f")
        done

        if [ ${#configs[@]} -eq 1 ]; then
            config_file="${configs[0]}"
            local name
            name=$(basename "$config_file" .yml)
            info "Using runner: $name"
        else
            printf "\033[1mAvailable runners:\033[0m\n\n"
            local i=1
            for f in "${configs[@]}"; do
                local name
                name=$(basename "$f" .yml)
                printf "  %d) %s\n" "$i" "$name"
                i=$((i + 1))
            done
            printf "\nSelect runner [1-%d]: " "${#configs[@]}"
            read -r selection

            if ! echo "$selection" | grep -qE '^[0-9]+$'; then
                error "Invalid selection."
            fi
            if [ "$selection" -lt 1 ] || [ "$selection" -gt "${#configs[@]}" ]; then
                error "Selection out of range."
            fi
            config_file="${configs[$((selection - 1))]}"
        fi
    fi

    # Verify runner module exists
    if [ ! -d "$RUNNER_MODULE_DIR" ]; then
        error "Runner module not found at $RUNNER_MODULE_DIR. Reinstall or update Toony."
    fi

    # Bootstrap virtualenv
    ensure_runner_venv

    local name
    name=$(basename "$config_file" .yml)
    info "Starting runner '$name'..."
    PYTHONPATH="$RUNNER_MODULE_DIR" exec "$RUNNERS_VENV/bin/python" -m toony_agent_runner --config "$config_file"
}

cmd_runner() {
    local subcmd="${1:-help}"
    shift 2>/dev/null || true

    case "$subcmd" in
        config)  runner_config ;;
        start)   runner_start "$@" ;;
        help|--help|-h)
            printf "Usage: toony runner <command>\n\n"
            printf "Commands:\n"
            printf "  \033[1mconfig\033[0m    Configure a new agent runner\n"
            printf "  \033[1mstart\033[0m     Start an agent runner\n"
            printf "  \033[1mhelp\033[0m      Show this help\n"
            ;;
        *)  error "Unknown runner command: $subcmd. Run 'toony runner help' for usage." ;;
    esac
}

cmd_uninstall() {
    exec "$INSTALL_DIR/uninstall.sh"
}

cmd_help() {
    printf "Usage: toony <command>\n\n"
    printf "Commands:\n"
    printf "  \033[1mstart\033[0m       Start all services\n"
    printf "  \033[1mstop\033[0m        Stop all services\n"
    printf "  \033[1mrestart\033[0m     Restart all services\n"
    printf "  \033[1mlogs\033[0m        Tail logs (optionally: toony logs backend)\n"
    printf "  \033[1mstatus\033[0m      Show service status\n"
    printf "  \033[1mbackup\033[0m      Backup the database (--list to show backups)\n"
    printf "  \033[1mupdate\033[0m      Update to the latest version (--local PATH, --no-backup)\n"
    printf "  \033[1mrunner\033[0m      Manage agent runners (config, start)\n"
    printf "  \033[1muninstall\033[0m   Remove Toony and all data\n"
    printf "  \033[1mhelp\033[0m        Show this help\n"
}

# --- Main ---

command="${1:-help}"
shift 2>/dev/null || true

case "$command" in
    start)      cmd_start ;;
    stop)       cmd_stop ;;
    restart)    cmd_restart ;;
    logs)       cmd_logs "$@" ;;
    status|ps)  cmd_status ;;
    backup)     cmd_backup "$@" ;;
    update)     cmd_update "$@" ;;
    runner)     cmd_runner "$@" ;;
    uninstall)  cmd_uninstall ;;
    help|--help|-h) cmd_help ;;
    *)          error "Unknown command: $command. Run 'toony help' for usage." ;;
esac
