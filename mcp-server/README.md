# Toony MCP Server

MCP (Model Context Protocol) server for [Toony](https://github.com/bikerlfh/toony-dev-core). Exposes 20 tools that allow Claude to manage projects, issues, comments, artifacts, workflows, and workspace resources.

## Requirements

- Python >= 3.11
- [uv](https://docs.astral.sh/uv/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/bikerlfh/toony-mcp/main/install.sh | bash
```

The installer will:
1. Clone the repo to `~/.toony/mcp-server/`
2. Prompt for your `TOONY_API_URL` and `TOONY_API_KEY`
3. Register the MCP server in Claude Code

Restart Claude Code after installation.

## Update

```bash
~/.toony/mcp-server/update.sh
```

Updates the code without changing your configuration.

## Uninstall

```bash
~/.toony/mcp-server/uninstall.sh
```

Removes the MCP server and deregisters it from Claude Code.

## Configuration

| Variable | Description | Default |
|---|---|---|
| `TOONY_API_URL` | Backend API base URL | `http://localhost:8000/api` |
| `TOONY_API_KEY` | User API Key (Bearer token) | Required |

The API Key is generated from the user's profile page in the Toony web application.

## Available Tools

### Projects (5 tools)

| Tool | Description | Parameters |
|---|---|---|
| `list_projects` | Lists all accessible projects | `search` (optional) |
| `get_project` | Gets detailed information about a project | `project_id` (UUID) |
| `list_project_members` | Lists members and their roles | `project_id` (UUID) |
| `list_project_milestones` | Lists project milestones | `project_id` (UUID) |
| `list_project_cycles` | Lists project cycles/sprints | `project_id` (UUID) |

### Issues (12 tools)

| Tool | Description | Parameters |
|---|---|---|
| `get_issue` | Gets issue details by UUID or identifier (e.g., `ENG-42`) | `issue_id` |
| `list_project_issues` | Lists issues with filters | `project_id`, `status`, `priority`, `assignee_id`, `milestone_id`, `cycle_id`, `label_ids`, `search` (all optional except project_id) |
| `get_my_issues` | Gets issues assigned to the authenticated user across all projects | `status`, `priority`, `search` (optional) |
| `create_issue` | Creates a new issue | `project_id`, `title` (required); `description`, `status`, `priority`, `assignee_id`, `milestone_id`, `cycle_id`, `label_ids`, `estimate`, `due_date` (optional) |
| `update_issue` | Updates an existing issue | `issue_id`, `project_id` (required); rest optional — pass `"none"` to clear fields |
| `list_issue_comments` | Lists comments on an issue | `issue_id`, `project_id` |
| `create_comment` | Adds a comment to an issue | `issue_id`, `project_id`, `body` (supports markdown) |
| `list_issue_activities` | Views the change history of an issue | `issue_id`, `project_id` |
| `list_issue_artifacts` | Lists attached artifacts (plans, specs, etc.) | `issue_id`, `project_id` |
| `create_artifact` | Publishes an artifact to an issue | `issue_id`, `project_id`, `title`, `artifact_type`, `content`; `requires_approval` (optional) |
| `update_artifact` | Updates an existing artifact | `artifact_id` (required); `title`, `content`, `status`, `requires_approval` (optional) |
| `delete_artifact` | Deletes an artifact | `artifact_id` (UUID) |

**Allowed values for `status`:** `BACKLOG`, `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELED`

**Allowed values for `priority`:** `NONE`, `URGENT`, `HIGH`, `MEDIUM`, `LOW`

**Allowed values for `artifact_type`:** `PLAN`, `DESIGN_DOC`, `TECHNICAL_SPEC`, `TEST_PLAN`, `OTHER`

**Allowed values for artifact `status`:** `DRAFT`, `PENDING_APPROVAL`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `REVISION_REQUESTED`, `SUPERSEDED`

### Workflows (1 tool)

| Tool | Description | Parameters |
|---|---|---|
| `get_issue_workflow` | Gets the resolved workflow for an issue as YAML | `issue_id` (UUID) |

### Workspace (2 tools)

| Tool | Description | Parameters |
|---|---|---|
| `list_labels` | Lists available labels for tagging issues | `search` (optional) |
| `search_global` | Global search across issues, projects, teams, and labels | `organization_id` (UUID), `query` |

## Usage Examples

```
# Query projects
"List my projects"
"Give me the details for project abc-123"
"Who are the members of project X?"

# Manage issues
"What are my pending issues?"
"Show me the urgent issues in project Y"
"Create an issue in project Z titled 'Fix login bug' with priority HIGH"
"Change the status of issue ENG-42 to IN_REVIEW"

# Comments and artifacts
"Add a comment to issue ENG-42: 'Fix deployed to staging'"
"Show me the activity history of issue ENG-10"
"Publish a technical plan on issue ENG-42"

# Search
"Search for 'authentication' in organization X"
"List the labels containing 'bug'"
```

## Architecture

```
Claude (MCP Client)
       |
       v
Toony MCP Server (FastMCP)
       |
       v
ToonyClient (HTTP + Bearer Token)
       |
       v
Django Backend API (/api/...)
```

1. Claude invokes an MCP tool
2. The server retrieves the global `ToonyClient` instance
3. The client makes the HTTP request with the Bearer token
4. The backend responds with JSON
5. The server serializes and returns the result to Claude

## Development

### Run locally

```bash
git clone https://github.com/bikerlfh/toony-mcp.git
cd toony-mcp
cp .env.example .env   # edit with your values
uv run toony-mcp
```

### Adding a new tool

1. Define the function in the corresponding module inside `src/toony_mcp/tools/`:

```python
from toony_mcp.server import mcp, get_client

@mcp.tool()
def my_new_tool(param: str) -> str:
    """Description of what the tool does."""
    client = get_client()
    result = client._get(f"/my-endpoint/{param}/")
    return json.dumps(result)
```

2. If you create a new tools module, import it in `server.py`:

```python
def main():
    import toony_mcp.tools.issues
    import toony_mcp.tools.projects
    import toony_mcp.tools.workspace
    import toony_mcp.tools.my_module  # new
    mcp.run()
```

3. If you need a new client method, add it in `client.py`.
