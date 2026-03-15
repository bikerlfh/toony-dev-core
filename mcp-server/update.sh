#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/bikerlfh/toony-mcp.git"
INSTALL_DIR="$HOME/.toony/mcp-server"

# --- Helpers ---

error() { echo "Error: $1" >&2; exit 1; }

check_command() {
    command -v "$1" >/dev/null 2>&1 || error "'$1' is not installed. Please install it first."
}

# --- Prerequisites ---

check_command git

# --- Verify installation ---

[ -d "$INSTALL_DIR" ] || error "Toony MCP is not installed. Run install.sh first."

# --- Clone latest version ---

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Fetching latest version..."
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" --quiet

# --- Replace code ---

rm -rf "$INSTALL_DIR"
cp -r "$TEMP_DIR" "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/.git"

echo "Updated successfully."
echo "Restart Claude Code to load the changes."
