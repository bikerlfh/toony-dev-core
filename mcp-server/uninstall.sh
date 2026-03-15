#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/.toony/mcp-server"
MCP_NAME="toony"

# --- Helpers ---

error() { echo "Error: $1" >&2; exit 1; }

# --- Verify installation ---

[ -d "$INSTALL_DIR" ] || error "Toony MCP is not installed at $INSTALL_DIR."

# --- Confirm ---

read -rp "This will remove Toony MCP and deregister it from Claude Code. Are you sure? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || exit 0

# --- Deregister from Claude Code ---

if command -v claude >/dev/null 2>&1; then
    echo "Removing MCP server from Claude Code..."
    claude mcp remove "$MCP_NAME" || true
fi

# --- Remove installation ---

rm -rf "$INSTALL_DIR"

echo "Toony MCP has been removed."
echo "Restart Claude Code to apply the changes."
