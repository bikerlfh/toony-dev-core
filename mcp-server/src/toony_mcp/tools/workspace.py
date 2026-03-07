import json

from toony_mcp.server import get_client, mcp


@mcp.tool()
def list_labels(search: str | None = None) -> str:
    """List all available labels for tagging issues.

    Args:
        search: Optional search query to filter labels by name
    """
    client = get_client()
    result = client.list_labels(search=search)
    return json.dumps(result)


@mcp.tool()
def search_global(organization_id: str, query: str) -> str:
    """Search across issues, projects, teams, and labels within an organization.

    Args:
        organization_id: UUID of the organization to search in
        query: Search query string
    """
    client = get_client()
    result = client.search_global(organization_id, query)
    return json.dumps(result)
