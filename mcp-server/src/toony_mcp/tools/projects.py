import json

from toony_mcp.server import get_client, mcp


@mcp.tool()
def list_projects(search: str | None = None) -> str:
    """List all projects accessible to the authenticated user.

    Args:
        search: Optional search query to filter projects by name or description
    """
    client = get_client()
    result = client.list_projects(search=search)
    return json.dumps(result)


@mcp.tool()
def get_project(project_id: str) -> str:
    """Get detailed information about a project.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.get_project(project_id)
    return json.dumps(result)


@mcp.tool()
def list_project_members(project_id: str) -> str:
    """List all members of a project with their roles.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_project_members(project_id)
    return json.dumps(result)


@mcp.tool()
def list_project_milestones(project_id: str) -> str:
    """List all milestones in a project.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_project_milestones(project_id)
    return json.dumps(result)


@mcp.tool()
def list_project_cycles(project_id: str) -> str:
    """List all cycles (sprints) in a project.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_project_cycles(project_id)
    return json.dumps(result)
