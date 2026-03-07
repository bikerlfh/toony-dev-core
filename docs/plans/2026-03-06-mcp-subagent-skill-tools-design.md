# MCP Tools: SubAgent & Skill CRUD — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 8 MCP tools (create/update/list/get for SubAgents and Skills) to the MCP server.

**Architecture:** Thin MCP tool functions → client HTTP methods → backend REST API. Slug-based lookup uses list+filter since backend has no get-by-slug endpoint.

**Tech Stack:** Python, FastMCP, requests

---

### Task 1: Add `_put` and SubAgent/Skill client methods to `client.py`

**Files:**
- Modify: `mcp-server/src/toony_mcp/client.py`

**Step 1: Add `_put` method and 8 new client methods**

Add `_put` after `_post` (line 33), then add SubAgent and Skill sections after the Workspace section (after line 111):

```python
# Add after _post method (line 33):
def _put(self, path: str, data: dict | None = None) -> dict:
    return self._request("PUT", path, json=data)
```

```python
# Add after the Workspace section (after line 111):

# -- SubAgents --
def list_subagents(
    self, search: str | None = None, organization: str | None = None
) -> dict:
    params = {}
    if search:
        params["search"] = search
    if organization:
        params["organization"] = organization
    return self._get("/subagents/", params=params)

def get_subagent(self, subagent_id: str) -> dict:
    return self._get(f"/subagents/{subagent_id}/")

def create_subagent(self, data: dict) -> dict:
    return self._post("/subagents/", data=data)

def update_subagent(self, subagent_id: str, data: dict) -> dict:
    return self._put(f"/subagents/{subagent_id}/", data=data)

# -- Skills --
def list_skills(
    self, search: str | None = None, organization: str | None = None
) -> dict:
    params = {}
    if search:
        params["search"] = search
    if organization:
        params["organization"] = organization
    return self._get("/skills/", params=params)

def get_skill(self, skill_id: str) -> dict:
    return self._get(f"/skills/{skill_id}/")

def create_skill(self, data: dict) -> dict:
    return self._post("/skills/", data=data)

def update_skill(self, skill_id: str, data: dict) -> dict:
    return self._put(f"/skills/{skill_id}/", data=data)
```

**Step 2: Commit**

```bash
git add mcp-server/src/toony_mcp/client.py
git commit -m "feat(mcp): add client methods for SubAgent and Skill CRUD"
```

---

### Task 2: Create `tools/agents.py` with SubAgent tools

**Files:**
- Create: `mcp-server/src/toony_mcp/tools/agents.py`

**Step 1: Create the file with a slug-lookup helper and 4 SubAgent tools**

```python
import json

from toony_mcp.server import get_client, mcp


def _find_by_slug(results: list[dict], slug: str) -> dict | None:
    """Find an item by exact slug match in a list of results."""
    for item in results:
        if item.get("slug") == slug:
            return item
    return None


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
        return json.dumps({"error": "Not found", "detail": f"No subagent with slug '{slug}'"})

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

    # Lookup by slug
    results = client.list_subagents(search=slug)
    if "error" in results:
        return json.dumps(results)

    match = _find_by_slug(results.get("results", []), slug)
    if not match:
        return json.dumps({"error": "Not found", "detail": f"No subagent with slug '{slug}'"})

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
```

**Step 2: Commit**

```bash
git add mcp-server/src/toony_mcp/tools/agents.py
git commit -m "feat(mcp): add SubAgent tools (list, get, create, update)"
```

---

### Task 3: Add Skill tools to `tools/agents.py`

**Files:**
- Modify: `mcp-server/src/toony_mcp/tools/agents.py`

**Step 1: Append 4 Skill tool functions at the end of `tools/agents.py`**

```python
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
        return json.dumps({"error": "Not found", "detail": f"No skill with slug '{slug}'"})

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

    # Lookup by slug
    results = client.list_skills(search=slug)
    if "error" in results:
        return json.dumps(results)

    match = _find_by_slug(results.get("results", []), slug)
    if not match:
        return json.dumps({"error": "Not found", "detail": f"No skill with slug '{slug}'"})

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
```

**Step 2: Commit**

```bash
git add mcp-server/src/toony_mcp/tools/agents.py
git commit -m "feat(mcp): add Skill tools (list, get, create, update)"
```

---

### Task 4: Register the agents tools module in `server.py`

**Files:**
- Modify: `mcp-server/src/toony_mcp/server.py:27-29`

**Step 1: Add the import**

Add `import toony_mcp.tools.agents` inside `main()`, alongside the other tool imports (line 29):

```python
def main():
    import toony_mcp.tools.agents   # noqa: F401
    import toony_mcp.tools.issues    # noqa: F401
    import toony_mcp.tools.projects  # noqa: F401
    import toony_mcp.tools.workspace # noqa: F401
    mcp.run()
```

**Step 2: Commit**

```bash
git add mcp-server/src/toony_mcp/server.py
git commit -m "feat(mcp): register agents tools module"
```

---

### Task 5: Smoke test

**Step 1: Run the MCP server to verify it starts without errors**

```bash
cd mcp-server && uv run toony-mcp --help
```

Expected: No import errors, help output shown.

**Step 2: Verify all tools are registered**

```bash
cd mcp-server && uv run python -c "
from toony_mcp.server import mcp
import toony_mcp.tools.agents
import toony_mcp.tools.issues
import toony_mcp.tools.projects
import toony_mcp.tools.workspace
print([t.name for t in mcp._tool_manager.list_tools()])
"
```

Expected: Output includes `list_subagents`, `get_subagent`, `create_subagent`, `update_subagent`, `list_skills`, `get_skill`, `create_skill`, `update_skill` alongside existing tools.

---

## File Changes Summary

| File | Change |
|------|--------|
| `mcp-server/src/toony_mcp/client.py` | Add `_put` method + 8 client methods (SubAgent + Skill CRUD) |
| `mcp-server/src/toony_mcp/tools/agents.py` | **New file** — `_find_by_slug` helper + 8 MCP tool functions |
| `mcp-server/src/toony_mcp/server.py` | Add `import toony_mcp.tools.agents` in `main()` |
