#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/bikerlfh/toony-mcp.git"
INSTALL_DIR="$HOME/.toony/mcp-server"
MCP_NAME="toony"
DEFAULT_API_URL="http://localhost:8000/api"

# --- Helpers ---

error() { echo "Error: $1" >&2; exit 1; }

check_command() {
    command -v "$1" >/dev/null 2>&1 || error "'$1' is not installed. Please install it first."
}

# --- Prerequisites ---

check_command git
check_command uv
check_command claude

# --- Check existing installation ---

if [ -d "$INSTALL_DIR" ]; then
    read -rp "$INSTALL_DIR already exists. Overwrite? [y/N] " confirm </dev/tty
    [[ "$confirm" =~ ^[Yy]$ ]] || exit 0
    rm -rf "$INSTALL_DIR"
fi

# --- Clone repo ---

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Cloning toony-mcp..."
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" --quiet

# --- Install ---

mkdir -p "$HOME/.toony"
cp -r "$TEMP_DIR" "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/.git"
echo "Installed to $INSTALL_DIR"

# --- Configuration ---
# Use env vars as defaults if set; always prompt for API key.

api_url="${TOONY_API_URL:-}"
if [ -z "$api_url" ]; then
    read -rp "TOONY_API_URL [$DEFAULT_API_URL]: " api_url </dev/tty
    api_url="${api_url:-$DEFAULT_API_URL}"
fi

read -rp "TOONY_API_KEY (required): " api_key </dev/tty
[ -z "$api_key" ] && error "TOONY_API_KEY is required."

# --- Register MCP in Claude Code ---

echo "Registering MCP server..."
claude mcp add "$MCP_NAME" --scope user \
    -e TOONY_API_URL="$api_url" \
    -e TOONY_API_KEY="$api_key" \
    -- uv --directory "$INSTALL_DIR" run toony-mcp

echo ""
echo "Done! Toony MCP is now available globally in Claude Code."
echo "Restart Claude Code to load the new MCP server."
