# MCP Server Deployment Design

**Date:** 2026-03-15
**Status:** Approved

## Overview

Extract the MCP server from the monorepo (`mcp-server/`) into a standalone public repository (`bikerlfh/toony-mcp`) with a one-liner installer for Claude Code users.

## Decisions

| Aspect | Decision |
|---|---|
| Repository | `bikerlfh/toony-mcp` (public, GitHub) |
| Folder name | `mcp-server` (unchanged) |
| Install method | `curl -fsSL .../install.sh \| bash` |
| Install directory | `~/.toony/mcp-server/` |
| Scripts | `install.sh`, `update.sh`, `uninstall.sh` |
| Configuration | Manual — user provides API URL + API key during install |
| MCP client | Claude Code first (extensible to other clients later) |
| Updates | `update.sh` replaces code, preserves config |
| Uninstall | Removes `~/.toony/mcp-server/` + `claude mcp remove toony`, does not touch `~/.toony/` |
| Clone method | HTTPS (public repo) |
| Language | All scripts, docs, and messages in English |

## Repository Structure

```
toony-mcp/                      # GitHub repo root
├── install.sh                  # Main installer (curl | bash)
├── update.sh                   # Update code without touching config
├── uninstall.sh                # Remove MCP and folder
├── pyproject.toml
├── uv.lock
├── .env.example
├── README.md
└── src/toony_mcp/
    ├── __init__.py
    ├── __main__.py
    ├── server.py
    ├── client.py
    └── tools/
        ├── __init__.py
        ├── projects.py
        ├── issues.py
        ├── workspace.py
        └── workflows.py
```

## install.sh

**Invocation:**
```bash
curl -fsSL https://raw.githubusercontent.com/bikerlfh/toony-mcp/main/install.sh | bash
```

**Flow:**

1. Verify prerequisites — `git`, `uv`, `claude`
2. Check existing installation — if `~/.toony/mcp-server/` exists, ask to overwrite
3. Clone repo — `git clone` (HTTPS) to a temp directory
4. Copy to destination — `~/.toony/mcp-server/`, remove `.git/`
5. Prompt for configuration — `TOONY_API_URL` (default: `http://localhost:8000/api`) and `TOONY_API_KEY` (required)
6. Register in Claude Code:
   ```bash
   claude mcp add toony --scope user -- uv --directory ~/.toony/mcp-server run toony-mcp
   claude mcp add-env toony TOONY_API_URL "$api_url"
   claude mcp add-env toony TOONY_API_KEY "$api_key"
   ```
7. Print success message — instruct user to restart Claude Code

## update.sh

**Invocation:**
```bash
~/.toony/mcp-server/update.sh
```

**Flow:**

1. Verify installation exists — error if `~/.toony/mcp-server/` is missing
2. Clone latest version — `git clone` to temp directory
3. Replace code — copy repo files to destination, remove `.git/`
4. Do not touch config — configuration lives in Claude Code's MCP registry, not in local files
5. Print success message — instruct user to restart Claude Code

Note: `update.sh` self-updates since it replaces itself along with the rest of the code.

## uninstall.sh

**Invocation:**
```bash
~/.toony/mcp-server/uninstall.sh
```

**Flow:**

1. Confirm — ask `Are you sure? [y/N]`
2. Deregister from Claude Code — `claude mcp remove toony`
3. Remove folder — `rm -rf ~/.toony/mcp-server/`
4. Do not touch `~/.toony/` — parent directory stays intact
5. Print success message — instruct user to restart Claude Code

## README.md

Sections:
- Project description (one-liner)
- Requirements (Python >= 3.11, uv, Claude Code CLI)
- Installation (`curl | bash` one-liner)
- Update (`~/.toony/mcp-server/update.sh`)
- Uninstall (`~/.toony/mcp-server/uninstall.sh`)
- Configuration (TOONY_API_URL, TOONY_API_KEY)
- Available tools (table with 20 tools grouped by category)
- Development (contributing / running locally)
