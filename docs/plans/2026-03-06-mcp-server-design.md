# MCP Server for Toony Dev Core

**Date:** 2026-03-06
**Status:** Approved

## Goal

Expose Toony's backend capabilities through a Model Context Protocol (MCP) server so that Claude Code/Desktop can interact with the project management system — reading issues, updating statuses, commenting, publishing artifacts, and more.

## Consumer

Claude Code / Claude Desktop. A developer connects the MCP to their IDE and the AI manages issues while they program.

## Architecture

```
Claude Code/Desktop
    | stdio (JSON-RPC)
    v
toony-mcp-server (Python, local process)
    | HTTP (requests)
    v
Backend Django (localhost:8000/api)
    | API Key -> User auth middleware
    v
Selectors / Services
```

The MCP server is a standalone Python package that communicates with the backend over HTTP. It does not access the database directly. It uses the `mcp` Python SDK and runs via stdio transport.

## Authentication: User API Keys

### Model

New model `UserAPIKey` in `accounts/`:

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | BaseModel PK |
| user | FK(User) | Owner |
| key_hash | CharField(128) | SHA-256 hash of the raw key |
| key_prefix | CharField(8) | First 8 chars for identification |
| name | CharField(100) | User-assigned label |
| is_active | BooleanField | Default True, set False to revoke |
| last_used_at | DateTimeField | Nullable, updated on each use |
| created_at | DateTimeField | BaseModel |
| updated_at | DateTimeField | BaseModel |

### Key Format

`toony_` prefix + 40 hex chars (e.g., `toony_a1b2c3d4e5f6...`). The raw key is shown once at creation. Only the SHA-256 hash is stored.

### Authentication Flow

1. MCP sends `Authorization: Bearer toony_xxx` header
2. `APIKeyAuthentication` (DRF authentication class) extracts the token
3. Hashes it with SHA-256, looks up `UserAPIKey` by hash
4. Validates `is_active=True`, updates `last_used_at`
5. Sets `request.user` to the key's owner
6. All existing permission classes apply unchanged

### API Endpoints

- `POST /api/auth/api-keys/` — Generate key (returns raw key once)
- `GET /api/auth/api-keys/` — List user's keys (prefix, name, last_used_at only)
- `DELETE /api/auth/api-keys/{id}/` — Revoke key (sets is_active=False)

## MCP Server Structure

```
mcp-server/
├── pyproject.toml          # deps: mcp, requests, python-dotenv
├── README.md
├── .env.example            # TOONY_API_URL, TOONY_API_KEY
└── src/
    └── toony_mcp/
        ├── __init__.py
        ├── server.py       # MCP server setup, tool registration
        ├── client.py       # HTTP client wrapper
        └── tools/
            ├── __init__.py
            ├── issues.py       # Issue CRUD, comments, activities, artifacts
            ├── projects.py     # Project listing, members, milestones, cycles
            └── workspace.py    # Labels, global search
```

### Configuration

Environment variables:

```bash
TOONY_API_URL=http://localhost:8000/api   # default
TOONY_API_KEY=toony_a1b2c3d4e5f6...
```

Claude Code config (`.mcp.json`):

```json
{
  "mcpServers": {
    "toony": {
      "command": "uv",
      "args": ["--directory", "./mcp-server", "run", "toony-mcp"],
      "env": {
        "TOONY_API_URL": "http://localhost:8000/api",
        "TOONY_API_KEY": "toony_a1b2c3d4e5f6..."
      }
    }
  }
}
```

## MCP Tools (17 total)

### Issues (10 tools)

| Tool | Params | Description |
|------|--------|-------------|
| `get_issue` | `issue_id` or `identifier` (e.g., "ENG-42") | Full issue detail |
| `list_project_issues` | `project_id`, optional filters: `status`, `priority`, `assignee_id`, `milestone_id`, `cycle_id`, `label_ids`, `search` | List issues with filters |
| `get_my_issues` | optional filters: `status`, `priority`, `search` | Issues assigned to the authenticated user |
| `create_issue` | `project_id`, `title`, optional: `description`, `status`, `priority`, `assignee_id`, `milestone_id`, `cycle_id`, `label_ids`, `estimate`, `due_date` | Create new issue |
| `update_issue` | `issue_id`, optional fields to update | Update issue fields (status, priority, assignee, etc.) |
| `list_issue_comments` | `issue_id` | List comments |
| `create_comment` | `issue_id`, `body` | Add comment |
| `list_issue_activities` | `issue_id` | Change history |
| `list_issue_artifacts` | `issue_id` | List artifacts |
| `create_artifact` | `issue_id`, `title`, `artifact_type` (PLAN/DESIGN_DOC/TECHNICAL_SPEC/TEST_PLAN/OTHER), `content`, optional: `requires_approval` | Publish artifact |

### Projects (5 tools)

| Tool | Params | Description |
|------|--------|-------------|
| `list_projects` | optional `search` | User's projects |
| `get_project` | `project_id` | Project detail |
| `list_project_members` | `project_id` | Members and roles |
| `list_project_milestones` | `project_id` | Project milestones |
| `list_project_cycles` | `project_id` | Project cycles |

### Workspace (2 tools)

| Tool | Params | Description |
|------|--------|-------------|
| `list_labels` | optional `search` | Available labels |
| `search_global` | `organization_id`, `query` | Cross-project search (issues, projects, teams, labels) |

## HTTP Client

`ToonyClient` class wraps all HTTP calls:

- One method per REST endpoint, maps 1:1 to MCP tools
- API key sent via `Authorization: Bearer` header
- HTTP errors translated to readable messages (404 -> "Issue not found", 403 -> "No permission")
- No business logic, pure transport

## Frontend Changes

Add an "API Keys" section to user settings or profile page:
- List existing keys (name, prefix, last_used_at, created_at)
- Generate new key (show raw key once with copy button)
- Revoke key (delete button with confirmation)

## Scope Summary

| Component | Location | What |
|-----------|----------|------|
| UserAPIKey model | `backend/accounts/` | Model, migration, service, selector, serializers |
| APIKeyAuthentication | `backend/accounts/` | DRF authentication class |
| API Key endpoints | `backend/accounts/views/` | CRUD (3 endpoints) |
| API Key UI | `frontend/` | Section to generate/revoke keys |
| MCP Server | `mcp-server/` | Python package with 17 tools, HTTP client, server setup |
| Tests | both | Backend tests for API keys, MCP tests with mocks |
