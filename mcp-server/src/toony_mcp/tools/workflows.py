from toony_mcp.server import get_client, mcp


@mcp.tool()
def get_issue_workflow(issue_id: str) -> str:
    """Get the resolved workflow for an issue as YAML.

    Resolves the best matching workflow for the given issue based on:
    1. Issue labels (matched against workflow label requirements)
    2. Scope priority: Issue > Project > Organization > Global

    Returns a YAML string describing the workflow DAG with nodes
    (subagents/skills) and their dependencies.

    Args:
        issue_id: The UUID of the issue to resolve workflow for
    """
    client = get_client()
    return client.resolve_issue_workflow_yaml(issue_id)
