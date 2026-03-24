#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/.toony"
APP_DIR="$INSTALL_DIR/app"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="$INSTALL_DIR/.env.prod"
BACKUP_DIR="$INSTALL_DIR/backups/db"

# --- Helpers ---
info()  { printf "\033[1;34m→\033[0m %s\n" "$1"; }
error() { printf "\033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }
warn()  { printf "\033[1;33m⚠\033[0m %s\n" "$1"; }
success() { printf "\033[1;32m✓\033[0m %s\n" "$1"; }

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

# --- Backup ---

BACKUP_FILE=""
read -rp "Backup the database before uninstalling? [Y/n] " do_backup
do_backup="${do_backup:-Y}"

if [[ "$do_backup" =~ ^[Yy]$ ]]; then
    if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/$COMPOSE_FILE" ]; then
        cd "$APP_DIR"

        # Ensure db is running
        if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db --format '{{.State}}' 2>/dev/null | grep -q "running"; then
            info "Starting database for backup..."
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db
            info "Waiting for database to be ready..."
            elapsed=0
            while [ $elapsed -lt 30 ]; do
                if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db --format '{{.Health}}' 2>/dev/null | grep -q "healthy"; then
                    break
                fi
                sleep 2
                elapsed=$((elapsed + 2))
            done
        fi

        db_user=$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2)
        db_name=$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2)
        timestamp=$(date +"%Y-%m-%dT%H-%M-%S")

        mkdir -p "$BACKUP_DIR"
        BACKUP_FILE="$BACKUP_DIR/toony-backup-${timestamp}.sql"

        info "Creating backup..."
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db pg_dump --data-only -U "$db_user" "$db_name" > "$BACKUP_FILE"
        success "Backup saved to $BACKUP_FILE"
    else
        warn "Cannot backup — application files not found."
    fi
fi

# --- Teardown ---

if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/$COMPOSE_FILE" ]; then
    info "Stopping services, removing volumes and images..."
    cd "$APP_DIR"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v --rmi local 2>/dev/null || true
fi

info "Removing 'toony' command..."
rm -f "$HOME/.local/bin/toony"

info "Removing application files..."
cd "$HOME"
rm -rf "$APP_DIR"
rm -f "$ENV_FILE"
rm -f "$INSTALL_DIR/toony.sh"
rm -f "$INSTALL_DIR/uninstall.sh"
rm -f "$INSTALL_DIR/.install-meta"

printf "\n\033[1;32m✓\033[0m Toony has been completely removed.\n"
if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    size=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    printf "\n  \033[1mBackup:\033[0m %s (%s)\n" "$BACKUP_FILE" "$size"
    printf "  Restore with: install.sh --restore %s\n\n" "$BACKUP_FILE"
fi
