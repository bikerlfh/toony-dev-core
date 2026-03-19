# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Toony MCP Server — a Python [MCP](https://modelcontextprotocol.io/) server that exposes 20 tools for Claude Code to manage projects, issues, comments, artifacts, and workflows in the Toony backend. Built with [FastMCP](https://github.com/jlowin/fastmcp) and communicates with the Django backend via Bearer-token HTTP requests.

## Common Commands

```bash
# Run the server locally (stdio transport by default)
cp .env.example .env   # set TOONY_API_URL and TOONY_API_KEY
uv run toony-mcp

# Install as a Claude Code MCP server (user scope)
./install.sh

# Update code without changing config
./update.sh

# Remove and deregister
./uninstall.sh
```

No tests or linter are configured for this sub-project.

## Architecture

```
Claude (MCP Client)  →  FastMCP Server (server.py)  →  ToonyClient (client.py)  →  Django Backend API
```

- **`server.py`** — Creates the `FastMCP` instance and a lazy-initialized singleton `ToonyClient`. The `main()` function imports all tool modules (side-effect registration) and starts the server.
- **`client.py`** — `ToonyClient` wraps `requests.Session` with Bearer auth. Provides typed methods for every backend endpoint. Errors return `{"error": ..., "detail": ...}` dicts instead of raising exceptions.
- **`tools/`** — One module per domain (`issues.py`, `projects.py`, `workflows.py`, `workspace.py`). Each tool is a `@mcp.tool()` decorated function that calls `get_client()`, invokes a client method, and returns `json.dumps(result)`.

### Adding a new tool

1. Add a function decorated with `@mcp.tool()` in the appropriate `tools/*.py` module (or create a new one).
2. Use `get_client()` from `server.py` to get the HTTP client.
3. If you create a new tools module, import it in `server.py:main()` so it gets registered.
4. If you need a new backend endpoint, add a corresponding method in `client.py`.

### Key conventions

- Tools accept and return strings (JSON-serialized). MCP tools cannot return dicts directly.
- Nullable FK fields (assignee, milestone, cycle, due_date) use the string `"none"` to clear the value on update — this is an MCP limitation since `None` means "not provided".
- Search parameters are sent as `?q=` to the backend (the client remaps `search` → `q`).
- The `update_issue` tool uses PUT (full update), not PATCH.
- `get_issue` resolves both UUIDs and human-readable identifiers (e.g., `ENG-42`) via the `/issues/{id}/` endpoint.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `TOONY_API_URL` | Backend API base URL | `http://localhost:8000/api` |
| `TOONY_API_KEY` | User API Key (Bearer token) | Required |
| `MCP_TRANSPORT` | Transport mode (`stdio` or `sse`) | `stdio` |
| `MCP_HOST` | Host for SSE transport | `127.0.0.1` |
| `MCP_PORT` | Port for SSE transport | `8001` |
