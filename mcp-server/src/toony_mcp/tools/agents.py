import json

from toony_mcp.server import get_client, mcp


def _find_by_slug(results: list[dict], slug: str) -> dict | None:
    """Find an item by exact slug match in a list of results."""
    for item in results:
        if item.get("slug") == slug:
            return item
    return None


# -- SubAgent Tools --


@mcp.tool()
def list_subagents(
    search: str | None = None,
    organization: str | None = None,
) -> str:
    """List all subagents accessible to the authenticated user.

    Args:
        search: Optional search query to filter by name
        organization: Optional organization slug to filter by
    """
    client = get_client()
    result = client.list_subagents(search=search, organization=organization)
    return json.dumps(result)


@mcp.tool()
def get_subagent(slug: str) -> str:
    """Get detailed information about a subagent by its slug.

    Args:
        slug: The slug identifier of the subagent
    """
    client = get_client()
    results = client.list_subagents(search=slug)
    if "error" in results:
        return json.dumps(results)

    match = _find_by_slug(results.get("results", []), slug)
    if not match:
        return json.dumps(
            {"error": "Not found", "detail": f"No subagent with slug '{slug}'"}
        )

    result = client.get_subagent(match["id"])
    return json.dumps(result)


@mcp.tool()
def create_subagent(
    name: str,
    slug: str,
    organization: str | None = None,
    description: str = "",
    markdown: str = "",
    version: str = "0.1.0",
    status: str | None = None,
    agent_type: str | None = None,
    tags: str | None = None,
) -> str:
    """Create a new subagent.

    Args:
        name: Display name for the subagent
        slug: URL-friendly identifier (must be unique within organization)
        organization: Organization slug (omit for global subagent)
        description: Short description (max 250 chars)
        markdown: Long-form content (markdown)
        version: Version string (default "0.1.0")
        status: Status (DRAFT, ACTIVE, INACTIVE, DEPRECATED)
        agent_type: Type (CODER, REVIEWER, TESTER, PLANNER, CUSTOM)
        tags: Comma-separated tags (e.g., "python,backend,testing")
    """
    client = get_client()
    data = {
        "name": name,
        "slug": slug,
        "description": description,
        "markdown": markdown,
        "version": version,
        "is_external": False,
    }

    if organization:
        data["organization"] = organization
    if status:
        data["status"] = status
    if agent_type:
        data["agent_type"] = agent_type
    if tags:
        data["tags"] = [t.strip() for t in tags.split(",")]

    result = client.create_subagent(data)
    return json.dumps(result)


@mcp.tool()
def update_subagent(
    slug: str,
    name: str | None = None,
    description: str | None = None,
    markdown: str | None = None,
    version: str | None = None,
    status: str | None = None,
    agent_type: str | None = None,
    tags: str | None = None,
    assigned_projects: str | None = None,
) -> str:
    """Update an existing subagent by its slug.

    Args:
        slug: The slug identifier of the subagent to update
        name: New display name
        description: New short description (max 250 chars)
        markdown: New long-form content (markdown)
        version: New version string
        status: New status (DRAFT, ACTIVE, INACTIVE, DEPRECATED)
        agent_type: New type (CODER, REVIEWER, TESTER, PLANNER, CUSTOM)
        tags: Comma-separated tags (replaces all tags)
        assigned_projects: Comma-separated project UUIDs (replaces all assignments)
    """
    client = get_client()

    results = client.list_subagents(search=slug)
    if "error" in results:
        return json.dumps(results)

    match = _find_by_slug(results.get("results", []), slug)
    if not match:
        return json.dumps(
            {"error": "Not found", "detail": f"No subagent with slug '{slug}'"}
        )

    data = {}
    if name is not None:
        data["name"] = name
    if description is not None:
        data["description"] = description
    if markdown is not None:
        data["markdown"] = markdown
    if version is not None:
        data["version"] = version
    if status is not None:
        data["status"] = status
    if agent_type is not None:
        data["agent_type"] = agent_type
    if tags is not None:
        data["tags"] = [t.strip() for t in tags.split(",")]
    if assigned_projects is not None:
        data["assigned_projects"] = [
            p.strip() for p in assigned_projects.split(",") if p.strip()
        ]

    result = client.update_subagent(match["id"], data)
    return json.dumps(result)


# -- Skill Tools --


@mcp.tool()
def list_skills(
    search: str | None = None,
    organization: str | None = None,
) -> str:
    """List all skills accessible to the authenticated user.

    Args:
        search: Optional search query to filter by name
        organization: Optional organization slug to filter by
    """
    client = get_client()
    result = client.list_skills(search=search, organization=organization)
    return json.dumps(result)


@mcp.tool()
def get_skill(slug: str) -> str:
    """Get detailed information about a skill by its slug.

    Args:
        slug: The slug identifier of the skill
    """
    client = get_client()
    results = client.list_skills(search=slug)
    if "error" in results:
        return json.dumps(results)

    match = _find_by_slug(results.get("results", []), slug)
    if not match:
        return json.dumps(
            {"error": "Not found", "detail": f"No skill with slug '{slug}'"}
        )

    result = client.get_skill(match["id"])
    return json.dumps(result)


@mcp.tool()
def create_skill(
    name: str,
    slug: str,
    organization: str | None = None,
    description: str = "",
    markdown: str = "",
    version: str = "0.1.0",
    status: str | None = None,
    category: str | None = None,
    tags: str | None = None,
) -> str:
    """Create a new skill.

    Args:
        name: Display name for the skill
        slug: URL-friendly identifier (must be unique within organization)
        organization: Organization slug (omit for global skill)
        description: Skill description
        markdown: Long-form content (markdown). Creates a version automatically.
        version: Version string (default "0.1.0")
        status: Status (DRAFT, ACTIVE, INACTIVE, DEPRECATED)
        category: Category (CODING, TESTING, REVIEW, DOCUMENTATION, DEPLOYMENT, CUSTOM)
        tags: Comma-separated tags (e.g., "python,backend,testing")
    """
    client = get_client()
    data = {
        "name": name,
        "slug": slug,
        "description": description,
        "markdown": markdown,
        "version": version,
        "is_external": False,
    }

    if organization:
        data["organization"] = organization
    if status:
        data["status"] = status
    if category:
        data["category"] = category
    if tags:
        data["tags"] = [t.strip() for t in tags.split(",")]

    result = client.create_skill(data)
    return json.dumps(result)


@mcp.tool()
def update_skill(
    slug: str,
    name: str | None = None,
    description: str | None = None,
    markdown: str | None = None,
    version: str | None = None,
    status: str | None = None,
    category: str | None = None,
    tags: str | None = None,
    changelog: str | None = None,
) -> str:
    """Update an existing skill by its slug.

    If markdown is changed, a new version is created automatically.

    Args:
        slug: The slug identifier of the skill to update
        name: New display name
        description: New description
        markdown: New long-form content (markdown). Triggers version creation if changed.
        version: New version string
        status: New status (DRAFT, ACTIVE, INACTIVE, DEPRECATED)
        category: New category (CODING, TESTING, REVIEW, DOCUMENTATION, DEPLOYMENT, CUSTOM)
        tags: Comma-separated tags (replaces all tags)
        changelog: Changelog entry for this update (used when markdown changes)
    """
    client = get_client()

    results = client.list_skills(search=slug)
    if "error" in results:
        return json.dumps(results)

    match = _find_by_slug(results.get("results", []), slug)
    if not match:
        return json.dumps(
            {"error": "Not found", "detail": f"No skill with slug '{slug}'"}
        )

    data = {}
    if name is not None:
        data["name"] = name
    if description is not None:
        data["description"] = description
    if markdown is not None:
        data["markdown"] = markdown
    if version is not None:
        data["version"] = version
    if status is not None:
        data["status"] = status
    if category is not None:
        data["category"] = category
    if tags is not None:
        data["tags"] = [t.strip() for t in tags.split(",")]
    if changelog is not None:
        data["changelog"] = changelog

    result = client.update_skill(match["id"], data)
    return json.dumps(result)
