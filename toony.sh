#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/.toony"
APP_DIR="$INSTALL_DIR/app"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="$INSTALL_DIR/.env.prod"
BACKUP_DIR="$INSTALL_DIR/backups"

# --- Helpers ---
info()    { printf "\033[1;34m→\033[0m %s\n" "$1"; }
success() { printf "\033[1;32m✓\033[0m %s\n" "$1"; }
error()   { printf "\033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }

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
    compose exec -T db pg_dump -U "$db_user" "$db_name" > "$backup_file"

    local size
    size=$(ls -lh "$backup_file" | awk '{print $5}')
    success "Backup saved to $backup_file ($size)"
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
    uninstall)  cmd_uninstall ;;
    help|--help|-h) cmd_help ;;
    *)          error "Unknown command: $command. Run 'toony help' for usage." ;;
esac
