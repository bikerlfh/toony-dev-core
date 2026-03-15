from notifications.registry import register
from notifications.types import NotificationData


@register("artifact.created")
def handle_artifact_created(context):
    artifact = context["artifact"]
    issue = context["issue"]
    actor = context.get("actor")

    recipients = set()
    if issue.assignee and issue.assignee != actor:
        recipients.add(issue.assignee)
    if issue.reporter and issue.reporter != actor:
        recipients.add(issue.reporter)

    metadata = {
        "project_id": str(issue.project_id),
        "issue_identifier": issue.identifier,
        "issue_id": str(issue.id),
    }

    return [
        NotificationData(
            recipient=r,
            organization=issue.project.organization,
            event_type="artifact.created",
            actor=actor,
            title=f"New artifact in {issue.identifier}: {artifact.title}",
            target_type="artifact",
            target_id=artifact.id,
            metadata=metadata,
        )
        for r in recipients
    ]
