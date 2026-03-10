from projects.models import IssueArtifact


def list_issue_artifacts(issue):
    return IssueArtifact.objects.filter(issue=issue).select_related("agent_task").order_by("-created_at")


def list_all_artifacts(user, *, filters=None):
    qs = (
        IssueArtifact.objects.filter(issue__project__memberships__user=user)
        .select_related("issue", "agent_task")
        .order_by("-created_at")
        .distinct()
    )
    if filters:
        if filters.get("artifact_type"):
            qs = qs.filter(artifact_type=filters["artifact_type"])
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        if filters.get("issue_id"):
            qs = qs.filter(issue_id=filters["issue_id"])
        if filters.get("agent_task_id"):
            qs = qs.filter(agent_task_id=filters["agent_task_id"])
    return qs


def get_artifact_by_id(artifact_id):
    return IssueArtifact.objects.select_related("issue", "agent_task").filter(id=artifact_id).first()
