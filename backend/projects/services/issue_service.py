from django.db import transaction
from django.utils import timezone

from projects.models import Issue, IssueActivity, IssueComment
from projects.selectors.issue_selector import get_next_identifier


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

    return issue


def update_issue(issue, user, **kwargs):
    label_ids = kwargs.pop("label_ids", None)

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

    return issue


def delete_issue(issue):
    issue.delete()


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
    return comment


def update_comment(comment, body):
    comment.body = body
    comment.edited_at = timezone.now()
    comment.save()
    return comment


def delete_comment(comment):
    comment.delete()
