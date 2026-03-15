import re

from accounts.models import User
from notifications.registry import register
from notifications.types import NotificationData


def _issue_metadata(issue):
    return {
        "project_id": str(issue.project_id),
        "issue_identifier": issue.identifier,
    }


@register("comment.created")
def handle_comment_created(context):
    issue = context["issue"]
    comment = context["comment"]
    actor = context["actor"]

    recipients = set()
    if issue.assignee and issue.assignee != actor:
        recipients.add(issue.assignee)
    if issue.reporter and issue.reporter != actor:
        recipients.add(issue.reporter)

    from projects.models import IssueComment
    prev_authors = (
        IssueComment.objects.filter(issue=issue)
        .exclude(author=actor)
        .exclude(id=comment.id)
        .values_list("author", flat=True)
        .distinct()
    )
    commenters = User.objects.filter(id__in=prev_authors)
    recipients.update(commenters)

    actor_name = actor.first_name or actor.email.split("@")[0]
    metadata = _issue_metadata(issue)
    return [
        NotificationData(
            recipient=r,
            organization=issue.project.organization,
            event_type="comment.created",
            actor=actor,
            title=f"{actor_name} comentó en {issue.identifier}",
            target_type="issue",
            target_id=issue.id,
            metadata=metadata,
        )
        for r in recipients
    ]


@register("comment.mentioned")
def handle_comment_mentioned(context):
    issue = context["issue"]
    actor = context["actor"]
    body = context["body"]

    emails = set(re.findall(r"@([\w.+-]+@[\w-]+\.[\w.-]+)", body))
    if not emails:
        return []

    mentioned_users = User.objects.filter(email__in=emails).exclude(id=actor.id)
    actor_name = actor.first_name or actor.email.split("@")[0]
    metadata = _issue_metadata(issue)
    return [
        NotificationData(
            recipient=u,
            organization=issue.project.organization,
            event_type="comment.mentioned",
            actor=actor,
            title=f"{actor_name} te mencionó en {issue.identifier}",
            target_type="issue",
            target_id=issue.id,
            metadata=metadata,
        )
        for u in mentioned_users
    ]
