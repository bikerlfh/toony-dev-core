import json

from toony_mcp.server import get_client, mcp


@mcp.tool()
def get_issue(issue_id: str) -> str:
    """Get detailed information about an issue by its UUID or identifier (e.g., 'ENG-42').

    Returns the issue with all related data: comments, activities,
    artifacts, documents, project info, assignee, reporter, labels,
    milestone, and cycle.
    """
    client = get_client()
    result = client.get_issue_full_detail(issue_id)
    return json.dumps(result)


@mcp.tool()
def list_project_issues(
    project_id: str,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    milestone_id: str | None = None,
    cycle_id: str | None = None,
    label_ids: str | None = None,
    search: str | None = None,
) -> str:
    """List issues in a project with optional filters.

    Args:
        project_id: UUID of the project
        status: Filter by status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: Filter by priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        assignee_id: Filter by assignee UUID
        milestone_id: Filter by milestone UUID
        cycle_id: Filter by cycle UUID
        label_ids: Comma-separated label UUIDs
        search: Full-text search query
    """
    client = get_client()
    result = client.list_project_issues(
        project_id,
        status=status,
        priority=priority,
        assignee_id=assignee_id,
        milestone_id=milestone_id,
        cycle_id=cycle_id,
        label_ids=label_ids,
        search=search,
    )
    return json.dumps(result)


@mcp.tool()
def get_my_issues(
    status: str | None = None,
    priority: str | None = None,
    search: str | None = None,
) -> str:
    """Get issues assigned to the authenticated user across all projects.

    Args:
        status: Filter by status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: Filter by priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        search: Full-text search query
    """
    client = get_client()
    me = client.get_me()
    if "error" in me:
        return json.dumps(me)

    result = client.list_user_issues(
        assignee_id=me["id"],
        status=status,
        priority=priority,
        search=search,
    )
    return json.dumps(result)


@mcp.tool()
def create_issue(
    project_id: str,
    title: str,
    description: str = "",
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    milestone_id: str | None = None,
    cycle_id: str | None = None,
    label_ids: str | None = None,
    due_date: str | None = None,
) -> str:
    """Create a new issue in a project.

    Args:
        project_id: UUID of the project
        title: Issue title
        description: Issue description (markdown)
        status: Initial status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: Priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        assignee_id: UUID of the user to assign
        milestone_id: UUID of the milestone
        cycle_id: UUID of the cycle
        label_ids: Comma-separated label UUIDs
        due_date: Due date (YYYY-MM-DD)
    """
    client = get_client()
    data = {"title": title, "description": description}

    if status:
        data["status"] = status
    if priority:
        data["priority"] = priority
    if assignee_id:
        data["assignee_id"] = assignee_id
    if milestone_id:
        data["milestone_id"] = milestone_id
    if cycle_id:
        data["cycle_id"] = cycle_id
    if label_ids:
        data["label_ids"] = [lid.strip() for lid in label_ids.split(",")]
    if due_date:
        data["due_date"] = due_date

    result = client.create_issue(project_id, data)
    return json.dumps(result)


@mcp.tool()
def update_issue(
    issue_id: str,
    project_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    milestone_id: str | None = None,
    cycle_id: str | None = None,
    label_ids: str | None = None,
    due_date: str | None = None,
) -> str:
    """Update an existing issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project the issue belongs to
        title: New title
        description: New description (markdown)
        status: New status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: New priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        assignee_id: UUID of new assignee (or "none" to unassign)
        milestone_id: UUID of milestone (or "none" to unset)
        cycle_id: UUID of cycle (or "none" to unset)
        label_ids: Comma-separated label UUIDs (replaces all labels)
        due_date: New due date (YYYY-MM-DD, or "none" to unset)
    """
    client = get_client()
    data = {}

    if title is not None:
        data["title"] = title
    if description is not None:
        data["description"] = description
    if status is not None:
        data["status"] = status
    if priority is not None:
        data["priority"] = priority
    if assignee_id is not None:
        data["assignee_id"] = None if assignee_id == "none" else assignee_id
    if milestone_id is not None:
        data["milestone_id"] = None if milestone_id == "none" else milestone_id
    if cycle_id is not None:
        data["cycle_id"] = None if cycle_id == "none" else cycle_id
    if label_ids is not None:
        data["label_ids"] = [lid.strip() for lid in label_ids.split(",") if lid.strip()]
    if due_date is not None:
        data["due_date"] = None if due_date == "none" else due_date

    result = client.update_issue(project_id, issue_id, data)
    return json.dumps(result)


@mcp.tool()
def list_issue_comments(issue_id: str, project_id: str) -> str:
    """List all comments on an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_issue_comments(project_id, issue_id)
    return json.dumps(result)


@mcp.tool()
def create_comment(issue_id: str, project_id: str, body: str) -> str:
    """Add a comment to an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
        body: Comment text (markdown supported)
    """
    client = get_client()
    result = client.create_comment(project_id, issue_id, body)
    return json.dumps(result)


@mcp.tool()
def list_issue_activities(issue_id: str, project_id: str) -> str:
    """View the activity/change history of an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_issue_activities(project_id, issue_id)
    return json.dumps(result)


@mcp.tool()
def list_issue_artifacts(issue_id: str, project_id: str) -> str:
    """List all artifacts attached to an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_issue_artifacts(project_id, issue_id)
    return json.dumps(result)


@mcp.tool()
def create_artifact(
    issue_id: str,
    project_id: str,
    title: str,
    artifact_type: str,
    content: str,
    requires_approval: bool = False,
) -> str:
    """Publish an artifact (plan, design doc, spec, etc.) to an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
        title: Artifact title
        artifact_type: Type (PLAN, DESIGN_DOC, TECHNICAL_SPEC, TEST_PLAN, OTHER)
        content: Artifact content (markdown)
        requires_approval: Whether the artifact needs approval before being finalized
    """
    client = get_client()
    data = {
        "title": title,
        "artifact_type": artifact_type,
        "content": content,
        "requires_approval": requires_approval,
    }
    result = client.create_artifact(project_id, issue_id, data)
    return json.dumps(result)


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
