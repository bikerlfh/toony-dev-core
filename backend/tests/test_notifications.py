import pytest

from notifications.models import Notification
from notifications.registry import _registry, get_handler, get_registered_events, register
from notifications.services import notify
from tests.factories import (
    IssueArtifactFactory,
    IssueCommentFactory,
    IssueFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


class TestRegistry:
    def test_register_and_get_handler(self):
        def my_handler(ctx):
            return []

        _registry["test.event"] = my_handler
        try:
            assert get_handler("test.event") is my_handler
        finally:
            _registry.pop("test.event", None)

    def test_unknown_event_returns_none(self):
        assert get_handler("nonexistent.event") is None

    def test_register_decorator(self):
        @register("test.decorator_event")
        def handler(ctx):
            return []

        try:
            assert get_handler("test.decorator_event") is handler
            assert "test.decorator_event" in get_registered_events()
        finally:
            _registry.pop("test.decorator_event", None)


class TestNotifyService:
    def test_notify_creates_notifications(self, issue, user, other_user):
        issue.assignee = other_user
        issue.save()

        result = notify("issue.assigned", {
            "issue": issue,
            "actor": user,
            "assignee": other_user,
        })

        assert len(result) == 1
        assert Notification.objects.filter(recipient=other_user).count() == 1
        n = Notification.objects.get(recipient=other_user)
        assert n.event_type == "issue.assigned"
        assert n.actor == user
        assert not n.is_read

    def test_notify_unknown_event_returns_empty(self):
        result = notify("unknown.event", {})
        assert result == []
        assert Notification.objects.count() == 0


class TestIssueHandlers:
    def test_assigned_notifies_assignee(self, issue, user, other_user):
        result = notify("issue.assigned", {
            "issue": issue,
            "actor": user,
            "assignee": other_user,
        })

        assert len(result) == 1
        assert result[0].recipient == other_user
        assert result[0].event_type == "issue.assigned"
        assert issue.identifier in result[0].title

    def test_assigned_skips_self_assign(self, issue, user):
        result = notify("issue.assigned", {
            "issue": issue,
            "actor": user,
            "assignee": user,
        })

        assert len(result) == 0

    def test_assigned_skips_none_assignee(self, issue, user):
        result = notify("issue.assigned", {
            "issue": issue,
            "actor": user,
            "assignee": None,
        })

        assert len(result) == 0

    def test_status_changed_notifies_assignee_and_reporter(self, issue, user, other_user):
        reporter = UserFactory()
        issue.assignee = other_user
        issue.reporter = reporter
        issue.save()

        result = notify("issue.status_changed", {
            "issue": issue,
            "actor": user,
            "old_status": "TODO",
            "new_status": "IN_PROGRESS",
        })

        recipients = {n.recipient for n in result}
        assert other_user in recipients
        assert reporter in recipients
        assert user not in recipients

    def test_status_changed_excludes_actor(self, issue, user):
        issue.assignee = user
        issue.reporter = user
        issue.save()

        result = notify("issue.status_changed", {
            "issue": issue,
            "actor": user,
            "old_status": "TODO",
            "new_status": "IN_PROGRESS",
        })

        assert len(result) == 0


class TestCommentHandlers:
    def test_created_notifies_participants(self, issue, user, other_user):
        issue.assignee = other_user
        issue.save()

        comment = IssueCommentFactory(issue=issue, author=user)

        result = notify("comment.created", {
            "issue": issue,
            "comment": comment,
            "actor": user,
        })

        recipients = {n.recipient for n in result}
        assert other_user in recipients
        assert user not in recipients

    def test_created_includes_previous_commenters(self, issue, user, other_user):
        commenter = UserFactory()
        IssueCommentFactory(issue=issue, author=commenter)

        comment = IssueCommentFactory(issue=issue, author=user)

        result = notify("comment.created", {
            "issue": issue,
            "comment": comment,
            "actor": user,
        })

        recipients = {n.recipient for n in result}
        assert commenter in recipients

    def test_mentioned_parses_emails(self, issue, user):
        mentioned = UserFactory(email="alice@example.com")
        body = "Hey @alice@example.com check this out"

        result = notify("comment.mentioned", {
            "issue": issue,
            "actor": user,
            "body": body,
        })

        assert len(result) == 1
        assert result[0].recipient == mentioned

    def test_mentioned_ignores_actor(self, issue, user):
        body = f"Note to self @{user.email}"

        result = notify("comment.mentioned", {
            "issue": issue,
            "actor": user,
            "body": body,
        })

        assert len(result) == 0

    def test_mentioned_no_emails_returns_empty(self, issue, user):
        result = notify("comment.mentioned", {
            "issue": issue,
            "actor": user,
            "body": "No mentions here",
        })

        assert len(result) == 0


class TestProjectHandlers:
    def test_member_added_notifies_member(self, project, user, other_user):
        result = notify("project.member_added", {
            "project": project,
            "member": other_user,
            "actor": user,
        })

        assert len(result) == 1
        assert result[0].recipient == other_user
        assert result[0].event_type == "project.member_added"
        assert project.name in result[0].title

    def test_member_added_skips_self(self, project, user):
        result = notify("project.member_added", {
            "project": project,
            "member": user,
            "actor": user,
        })

        assert len(result) == 0

    def test_member_removed_notifies_member(self, project, user, other_user):
        result = notify("project.member_removed", {
            "project": project,
            "member": other_user,
            "actor": user,
        })

        assert len(result) == 1
        assert result[0].recipient == other_user
        assert result[0].event_type == "project.member_removed"

    def test_member_removed_skips_self(self, project, user):
        result = notify("project.member_removed", {
            "project": project,
            "member": user,
            "actor": user,
        })

        assert len(result) == 0


class TestAgentHandlers:
    def test_task_completed_notifies_creator(self, agent_task):
        result = notify("agent_task.completed", {"task": agent_task})

        assert len(result) == 1
        assert result[0].recipient == agent_task.created_by
        assert result[0].event_type == "agent_task.completed"
        assert agent_task.title in result[0].title

    def test_task_failed_includes_error(self, agent_task):
        agent_task.error = "Connection timeout"
        agent_task.save()

        result = notify("agent_task.failed", {"task": agent_task})

        assert len(result) == 1
        assert result[0].recipient == agent_task.created_by
        assert result[0].event_type == "agent_task.failed"
        assert result[0].body == "Connection timeout"


class TestArtifactHandlers:
    def test_created_notifies_issue_participants(self, artifact, issue, user, other_user):
        issue.assignee = other_user
        issue.save()

        result = notify("artifact.created", {
            "artifact": artifact,
            "issue": issue,
            "actor": user,
        })

        recipients = {n.recipient for n in result}
        assert other_user in recipients
        assert user not in recipients

    def test_created_notifies_reporter(self, artifact, issue, other_user):
        issue.reporter = other_user
        issue.save()

        result = notify("artifact.created", {
            "artifact": artifact,
            "issue": issue,
            "actor": None,
        })

        assert len(result) == 1
        assert result[0].recipient == other_user
