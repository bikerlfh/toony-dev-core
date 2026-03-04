from django.db import transaction
from django.utils import timezone

from common.broadcast import broadcast
from projects.models import Issue, IssueActivity, IssueComment
from projects.selectors.issue_selector import get_next_identifier
from projects.serializers.output import IssueCommentSerializer, IssueListSerializer


def create_issue(project, reporter, title, **kwargs):
    identifier = get_next_identifier(project)
    label_ids = kwargs.pop("label_ids", [])

    with transaction.atomic():
        issue = Issue.objects.create(
            project=project,
            reporter=reporter,
            identifier=identifier,
            title=title,
            **kwargs,
        )
        if label_ids:
            issue.labels.set(label_ids)

        IssueActivity.objects.create(
            issue=issue,
            user=reporter,
            action="created",
        )

    broadcast(
        f"project_{project.id}",
        "issue_created",
        IssueListSerializer(issue).data,
    )

    return issue


def update_issue(issue, user, **kwargs):
    label_ids = kwargs.pop("label_ids", None)

    from rest_framework.exceptions import ValidationError as DRFValidationError
    from projects.models.issue import IssueStatus

    editable_statuses = {IssueStatus.BACKLOG, IssueStatus.TODO}
    if ("title" in kwargs or "description" in kwargs) and issue.status not in editable_statuses:
        raise DRFValidationError(
            "Title and description can only be edited when the issue is in BACKLOG or TODO status."
        )

    tracked_fields = {
        "title", "description", "status", "priority",
        "assignee", "milestone", "cycle", "parent",
        "estimate", "due_date", "sort_order",
    }

    activities = []
    for field, new_value in kwargs.items():
        if field in tracked_fields:
            old_value = getattr(issue, field)
            # Convert FK objects to their string representation
            old_str = str(old_value) if old_value is not None else ""
            new_str = str(new_value) if new_value is not None else ""
            if old_str != new_str:
                activities.append(
                    IssueActivity(
                        issue=issue,
                        user=user,
                        action="updated",
                        field_changed=field,
                        old_value=old_str,
                        new_value=new_str,
                    )
                )

    with transaction.atomic():
        allowed_fields = {
            "title", "description", "status", "priority",
            "assignee", "milestone", "cycle", "parent",
            "estimate", "due_date", "sort_order",
            "external_tracker_name", "external_tracker_url",
            "external_tracker_id",
        }
        for field, value in kwargs.items():
            if field in allowed_fields:
                setattr(issue, field, value)
        issue.save()

        if label_ids is not None:
            issue.labels.set(label_ids)
            activities.append(
                IssueActivity(
                    issue=issue,
                    user=user,
                    action="updated",
                    field_changed="labels",
                )
            )

        if activities:
            IssueActivity.objects.bulk_create(activities)

    issue.refresh_from_db()
    broadcast(
        f"project_{issue.project_id}",
        "issue_updated",
        IssueListSerializer(issue).data,
    )

    return issue


def delete_issue(issue):
    project_id = issue.project_id
    issue_id = str(issue.id)
    issue.delete()

    broadcast(
        f"project_{project_id}",
        "issue_deleted",
        {"id": issue_id},
    )


def create_comment(issue, author, body):
    with transaction.atomic():
        comment = IssueComment.objects.create(
            issue=issue,
            author=author,
            body=body,
        )
        IssueActivity.objects.create(
            issue=issue,
            user=author,
            action="commented",
        )

    broadcast(
        f"project_{issue.project_id}",
        "comment_created",
        {
            "issue_id": str(issue.id),
            "comment": IssueCommentSerializer(comment).data,
        },
    )

    return comment


def update_comment(comment, body):
    comment.body = body
    comment.edited_at = timezone.now()
    comment.save()

    broadcast(
        f"project_{comment.issue.project_id}",
        "comment_updated",
        {
            "issue_id": str(comment.issue_id),
            "comment": IssueCommentSerializer(comment).data,
        },
    )

    return comment


def delete_comment(comment):
    project_id = comment.issue.project_id
    issue_id = str(comment.issue_id)
    comment_id = str(comment.id)
    comment.delete()

    broadcast(
        f"project_{project_id}",
        "comment_deleted",
        {"issue_id": issue_id, "comment_id": comment_id},
    )
