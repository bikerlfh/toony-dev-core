from notifications.registry import register
from notifications.types import NotificationData


def _issue_metadata(issue):
    return {
        "project_id": str(issue.project_id),
        "issue_identifier": issue.identifier,
    }


@register("issue.assigned")
def handle_issue_assigned(context):
    issue = context["issue"]
    actor = context["actor"]
    assignee = context["assignee"]

    if not assignee or assignee == actor:
        return []

    return [NotificationData(
        recipient=assignee,
        organization=issue.project.organization,
        event_type="issue.assigned",
        actor=actor,
        title=f"Te asignaron {issue.identifier}: {issue.title}",
        target_type="issue",
        target_id=issue.id,
        metadata=_issue_metadata(issue),
    )]


@register("issue.status_changed")
def handle_issue_status_changed(context):
    issue = context["issue"]
    actor = context["actor"]
    old_status = context["old_status"]
    new_status = context["new_status"]

    recipients = set()
    if issue.assignee and issue.assignee != actor:
        recipients.add(issue.assignee)
    if issue.reporter and issue.reporter != actor:
        recipients.add(issue.reporter)

    metadata = _issue_metadata(issue)
    return [
        NotificationData(
            recipient=r,
            organization=issue.project.organization,
            event_type="issue.status_changed",
            actor=actor,
            title=f"{issue.identifier} pasó de {old_status} a {new_status}",
            target_type="issue",
            target_id=issue.id,
            metadata=metadata,
        )
        for r in recipients
    ]
