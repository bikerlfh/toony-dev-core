# MCP Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare all files in `mcp-server/` so the directory can be pushed as-is to the standalone `bikerlfh/toony-mcp` public repo.

**Architecture:** Rewrite `install.sh` for HTTPS clone to `~/.toony/mcp-server/`, add `update.sh` and `uninstall.sh`, rewrite `README.md` for standalone usage, remove `.mcp.json.example` (no longer needed).

**Tech Stack:** Bash scripts, uv, Claude Code CLI

---

### Task 1: Rewrite install.sh

**Files:**
- Modify: `mcp-server/install.sh`

**Step 1: Rewrite install.sh with the new flow**

Replace the entire file with:

```bash
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
    read -rp "$INSTALL_DIR already exists. Overwrite? [y/N] " confirm
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

# --- Prompt for configuration ---

read -rp "TOONY_API_URL [$DEFAULT_API_URL]: " api_url
api_url="${api_url:-$DEFAULT_API_URL}"

read -rp "TOONY_API_KEY (required): " api_key
[ -z "$api_key" ] && error "TOONY_API_KEY is required."

# --- Register MCP in Claude Code ---

echo "Registering MCP server..."
claude mcp add "$MCP_NAME" --scope user -- uv --directory "$INSTALL_DIR" run toony-mcp
claude mcp add-env "$MCP_NAME" TOONY_API_URL "$api_url"
claude mcp add-env "$MCP_NAME" TOONY_API_KEY "$api_key"

echo ""
echo "Done! Toony MCP is now available globally in Claude Code."
echo "Restart Claude Code to load the new MCP server."
```

Key changes from current version:
- `REPO_URL` uses HTTPS instead of SSH
- `INSTALL_DIR` is `~/.toony/mcp-server/` instead of `~/.toony/`
- Added `mkdir -p "$HOME/.toony"` before copy
- Removed `--transport stdio` from `claude mcp add` (stdio is the default)

**Step 2: Verify the script is valid bash**

Run: `bash -n mcp-server/install.sh`
Expected: No output (syntax OK)

**Step 3: Commit**

```bash
git add mcp-server/install.sh
git commit -m "fix(mcp): update install.sh for standalone repo deployment

- Use HTTPS clone URL instead of SSH (public repo)
- Install to ~/.toony/mcp-server/ instead of ~/.toony/
- Add mkdir -p for parent directory creation"
```

---

### Task 2: Create update.sh

**Files:**
- Create: `mcp-server/update.sh`

**Step 1: Write update.sh**

```bash
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
```

**Step 2: Make it executable**

Run: `chmod +x mcp-server/update.sh`

**Step 3: Verify the script is valid bash**

Run: `bash -n mcp-server/update.sh`
Expected: No output (syntax OK)

**Step 4: Commit**

```bash
git add mcp-server/update.sh
git commit -m "feat(mcp): add update.sh script

- Clone latest version and replace installed code
- Preserve Claude Code MCP config (env vars untouched)
- Self-updates along with the rest of the code"
```

---

### Task 3: Create uninstall.sh

**Files:**
- Create: `mcp-server/uninstall.sh`

**Step 1: Write uninstall.sh**

```bash
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
```

**Step 2: Make it executable**

Run: `chmod +x mcp-server/uninstall.sh`

**Step 3: Verify the script is valid bash**

Run: `bash -n mcp-server/uninstall.sh`
Expected: No output (syntax OK)

**Step 4: Commit**

```bash
git add mcp-server/uninstall.sh
git commit -m "feat(mcp): add uninstall.sh script

- Confirm before removing
- Deregister MCP from Claude Code
- Remove ~/.toony/mcp-server/ only (preserve ~/.toony/)"
```

---

### Task 4: Rewrite README.md for standalone repo

**Files:**
- Modify: `mcp-server/README.md`

**Step 1: Rewrite README.md**

Replace the entire file. Keep the existing tools table and architecture sections. Replace setup instructions with install/update/uninstall commands. Remove references to the monorepo (`.mcp.json.example`, `cd mcp-server`). Add Development section for contributors.

The README should have these sections in order:
1. Title + one-liner description
2. Requirements (Python >= 3.11, uv, Claude Code CLI)
3. Installation (`curl | bash` one-liner)
4. Update (`~/.toony/mcp-server/update.sh`)
5. Uninstall (`~/.toony/mcp-server/uninstall.sh`)
6. Configuration (TOONY_API_URL, TOONY_API_KEY table)
7. Available tools (reuse existing 4 tables: Projects, Issues, Workflows, Workspace)
8. Usage examples (reuse existing examples)
9. Architecture (reuse existing diagram)
10. Development (run locally with `uv run toony-mcp`, adding new tools guide)

**Step 2: Commit**

```bash
git add mcp-server/README.md
git commit -m "docs(mcp): rewrite README for standalone repo

- Replace monorepo setup with curl|bash install instructions
- Add update and uninstall sections
- Keep tools reference, architecture, and dev guide"
```

---

### Task 5: Remove .mcp.json.example

**Files:**
- Delete: `mcp-server/.mcp.json.example`

**Step 1: Delete the file**

Run: `rm mcp-server/.mcp.json.example`

The installer handles registration directly via `claude mcp add`, so this file is no longer needed in the standalone repo.

**Step 2: Commit**

```bash
git add mcp-server/.mcp.json.example
git commit -m "chore(mcp): remove .mcp.json.example

- No longer needed: install.sh registers MCP via claude CLI directly"
```

---

### Task 6: Make install.sh executable and final verification

**Files:**
- Modify: `mcp-server/install.sh` (permissions only)

**Step 1: Ensure all scripts are executable**

Run: `chmod +x mcp-server/install.sh mcp-server/update.sh mcp-server/uninstall.sh`

**Step 2: Verify all scripts pass syntax check**

Run: `bash -n mcp-server/install.sh && bash -n mcp-server/update.sh && bash -n mcp-server/uninstall.sh && echo "All scripts OK"`
Expected: `All scripts OK`

**Step 3: Verify the final file listing matches the design**

Run: `find mcp-server -type f -not -path '*/\.*' -not -path '*/__pycache__/*' -not -path '*/.venv/*' | sort`

Expected files:
```
mcp-server/.env.example
mcp-server/README.md
mcp-server/install.sh
mcp-server/pyproject.toml
mcp-server/uninstall.sh
mcp-server/update.sh
mcp-server/uv.lock
mcp-server/src/toony_mcp/__init__.py
mcp-server/src/toony_mcp/__main__.py
mcp-server/src/toony_mcp/client.py
mcp-server/src/toony_mcp/server.py
mcp-server/src/toony_mcp/tools/__init__.py
mcp-server/src/toony_mcp/tools/issues.py
mcp-server/src/toony_mcp/tools/projects.py
mcp-server/src/toony_mcp/tools/workflows.py
mcp-server/src/toony_mcp/tools/workspace.py
```

**Step 4: Commit permissions if changed**

```bash
git add mcp-server/install.sh
git commit -m "chore(mcp): ensure install.sh is executable"
```

(Only if permissions changed — skip if already executable.)
