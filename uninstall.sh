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

cd "$INSTALL_DIR"

if [ -f "$COMPOSE_FILE" ]; then
    info "Stopping services, removing volumes and images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v --rmi local 2>/dev/null || true
fi

info "Removing $INSTALL_DIR..."
cd "$HOME"
rm -rf "$INSTALL_DIR"

printf "\n\033[1;32m✓\033[0m Toony has been completely removed.\n"
