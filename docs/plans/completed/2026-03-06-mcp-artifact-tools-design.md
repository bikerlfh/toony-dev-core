# MCP Artifact Tools — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add update_artifact and delete_artifact MCP tools, backed by a new global DELETE endpoint.

**Architecture:** Add DELETE to existing GlobalArtifactDetailView, then add MCP client methods and tool functions.

**Tech Stack:** Django/DRF, Python, FastMCP, requests

---

### Task 1: Add DELETE to GlobalArtifactDetailView

**Files:**
- Modify: `backend/projects/views/artifact_views.py:112-142`

**Step 1: Add delete method to GlobalArtifactDetailView**

Add after the existing `patch` method (line 142):

```python
def delete(self, request, artifact_id):
    artifact = get_artifact_by_id(artifact_id)
    if artifact is None:
        raise NotFound("Artifact not found.")
    self._check_access(artifact, request.user)
    delete_artifact(artifact)
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Ensure `delete_artifact` is imported at the top of the file (it should already be imported from services).

**Step 2: Verify import of `status` from rest_framework**

Check that `from rest_framework import status` is already imported. If not, add it.

**Step 3: Commit**

```bash
git add backend/projects/views/artifact_views.py
git commit -m "feat(api): add DELETE to global artifact endpoint"
```

---

### Task 2: Add artifact client methods to `client.py`

**Files:**
- Modify: `mcp-server/src/toony_mcp/client.py`

**Step 1: Add 3 artifact methods after the existing Workspace section (after line 111)**

Insert before the SubAgents section:

```python
# -- Artifacts --
def get_artifact(self, artifact_id: str) -> dict:
    return self._get(f"/artifacts/{artifact_id}/")

def update_artifact(self, artifact_id: str, data: dict) -> dict:
    return self._patch(f"/artifacts/{artifact_id}/", data=data)

def delete_artifact(self, artifact_id: str) -> dict:
    return self._delete(f"/artifacts/{artifact_id}/")
```

**Step 2: Commit**

```bash
git add mcp-server/src/toony_mcp/client.py
git commit -m "feat(mcp): add artifact client methods (get, update, delete)"
```

---

### Task 3: Add update_artifact and delete_artifact MCP tools

**Files:**
- Modify: `mcp-server/src/toony_mcp/tools/issues.py`

**Step 1: Add two tools at the end of `tools/issues.py`**

```python
@mcp.tool()
def update_artifact(
    artifact_id: str,
    title: str | None = None,
    content: str | None = None,
    status: str | None = None,
    requires_approval: bool | None = None,
) -> str:
    """Update an existing artifact.

    Args:
        artifact_id: UUID of the artifact
        title: New title
        content: New content (markdown)
        status: New status (DRAFT, PENDING_APPROVAL, IN_REVIEW, APPROVED, REJECTED, REVISION_REQUESTED, SUPERSEDED). Must follow valid state transitions.
        requires_approval: Whether the artifact needs approval
    """
    client = get_client()
    data = {}
    if title is not None:
        data["title"] = title
    if content is not None:
        data["content"] = content
    if status is not None:
        data["status"] = status
    if requires_approval is not None:
        data["requires_approval"] = requires_approval

    result = client.update_artifact(artifact_id, data)
    return json.dumps(result)


@mcp.tool()
def delete_artifact(artifact_id: str) -> str:
    """Delete an artifact.

    Args:
        artifact_id: UUID of the artifact to delete
    """
    client = get_client()
    result = client.delete_artifact(artifact_id)
    return json.dumps(result)
```

**Step 2: Commit**

```bash
git add mcp-server/src/toony_mcp/tools/issues.py
git commit -m "feat(mcp): add update_artifact and delete_artifact tools"
```

---

### Task 4: Update toony-mcp skill

**Files:**
- Modify: `.claude/skills/toony-mcp/skill.md`

**Step 1: Update the Creating Artifacts section**

Replace the existing "Creating Artifacts" section with an expanded "Artifacts" section that includes update and delete:

```markdown
## Artifacts

- Use **`create_artifact`** to publish plans, design docs, specs, or test plans attached to an issue.
- **`update_artifact`** — update by UUID. Fields: `title`, `content`, `status`, `requires_approval`. Status must follow valid transitions.
- **`delete_artifact`** — delete by UUID.
- `artifact_type` values: `PLAN`, `DESIGN_DOC`, `TECHNICAL_SPEC`, `TEST_PLAN`, `OTHER`.
- Content supports markdown.
```

**Step 2: Add artifact status to Enum Reference**

Add to the Enum Reference section:

```markdown
- **Artifact status:** `DRAFT`, `PENDING_APPROVAL`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `REVISION_REQUESTED`, `SUPERSEDED`
```

**Step 3: Commit**

```bash
git add .claude/skills/toony-mcp/skill.md
git commit -m "docs: update toony-mcp skill with artifact update/delete tools"
```

---

### Task 5: Smoke test

**Step 1: Run backend tests to verify the new DELETE endpoint doesn't break anything**

```bash
make test
```

**Step 2: Verify MCP tools register**

```bash
cd mcp-server && uv run python -c "
from toony_mcp.server import mcp
import toony_mcp.tools.agents
import toony_mcp.tools.issues
import toony_mcp.tools.projects
import toony_mcp.tools.workspace
tools = [t.name for t in mcp._tool_manager.list_tools()]
for t in ['update_artifact', 'delete_artifact']:
    status = 'OK' if t in tools else 'MISSING'
    print(f'  {t}: {status}')
print(f'Total tools: {len(tools)}')
"
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `backend/projects/views/artifact_views.py` | Add `delete` method to `GlobalArtifactDetailView` |
| `mcp-server/src/toony_mcp/client.py` | Add 3 artifact methods (get, update, delete) |
| `mcp-server/src/toony_mcp/tools/issues.py` | Add `update_artifact` and `delete_artifact` tools |
| `.claude/skills/toony-mcp/skill.md` | Add artifact update/delete docs + status enum |
