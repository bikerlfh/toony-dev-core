import pytest
from django.test.utils import override_settings

from projects.models import IssueStatus
from projects.services import update_issue
from toony_agents.models import AgentTask

pytestmark = pytest.mark.django_db

DEFAULT_TEMPLATE = "Use toony skill and implement {issue_identifier}"


class TestAutoAgentTaskCreation:
    """Tests for auto-creating AgentTask when issue moves BACKLOG→TODO."""

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_backlog_to_todo_creates_agent_task(self, issue, toony_agent, user):
        """Moving issue from BACKLOG to TODO creates an AgentTask."""
        assert issue.status == IssueStatus.BACKLOG

        update_issue(issue, user, status=IssueStatus.TODO)

        task = AgentTask.objects.filter(issue=issue).first()
        assert task is not None
        assert task.organization == issue.project.organization
        assert task.project == issue.project
        assert task.issue == issue
        assert task.toony_agent == toony_agent
        assert task.title == issue.title
        assert task.prompt == f"Use toony skill and implement {issue.identifier}"
        assert task.created_by == user

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_in_progress_does_not_create_task(self, issue, toony_agent, user):
        """Only BACKLOG→TODO triggers auto-creation, not other transitions."""
        issue.status = IssueStatus.TODO
        issue.save()

        update_issue(issue, user, status=IssueStatus.IN_PROGRESS)

        assert AgentTask.objects.filter(issue=issue).count() == 0

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_no_toony_agent_for_org_skips_creation(self, issue, user):
        """If no ToonyAgent is associated with the org, no task is created."""
        update_issue(issue, user, status=IssueStatus.TODO)

        assert AgentTask.objects.filter(issue=issue).count() == 0

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_picks_most_recently_connected_agent(self, issue, user, organization):
        """Selects the ToonyAgent with the most recent last_connected_at."""
        from django.utils import timezone

        from tests.factories import ToonyAgentFactory

        old_agent = ToonyAgentFactory(last_connected_at=timezone.now() - timezone.timedelta(days=2))
        old_agent.organizations.add(organization)

        new_agent = ToonyAgentFactory(last_connected_at=timezone.now())
        new_agent.organizations.add(organization)

        update_issue(issue, user, status=IssueStatus.TODO)

        task = AgentTask.objects.get(issue=issue)
        assert task.toony_agent == new_agent

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_project_template_overrides_default(self, issue, toony_agent, user):
        """ProjectSettings.auto_task_prompt_template overrides env var."""
        settings_obj = issue.project.settings
        settings_obj.auto_task_prompt_template = "Custom: {issue_id}"
        settings_obj.save()

        update_issue(issue, user, status=IssueStatus.TODO)

        task = AgentTask.objects.get(issue=issue)
        assert task.prompt == f"Custom: {issue.id}"

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE="")
    def test_no_template_configured_skips_creation(self, issue, toony_agent, user):
        """If neither project nor env var has a template, no task is created."""
        update_issue(issue, user, status=IssueStatus.TODO)

        assert AgentTask.objects.filter(issue=issue).count() == 0

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_issue_status_changes_even_if_no_agent(self, issue, user):
        """The issue status update succeeds regardless of agent availability."""
        update_issue(issue, user, status=IssueStatus.TODO)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO


class TestAgentTaskLifecycleOnStatusChange:
    """Tests for AgentTask lifecycle when issue status changes."""

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_cancels_queued_task(self, issue, toony_agent, user):
        """Moving issue TODO→BACKLOG cancels QUEUED agent tasks."""
        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        assert task.status == "QUEUED"

        update_issue(issue, user, status=IssueStatus.BACKLOG)

        task.refresh_from_db()
        assert task.status == "CANCELLED"

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_blocks_if_task_assigned(self, issue, toony_agent, user):
        """Cannot move issue TODO→BACKLOG if agent task is ASSIGNED."""
        from rest_framework.exceptions import ValidationError

        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "ASSIGNED"
        task.save()

        with pytest.raises(ValidationError, match="AgentTask"):
            update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_blocks_if_task_running(self, issue, toony_agent, user):
        """Cannot move issue TODO→BACKLOG if agent task is RUNNING."""
        from rest_framework.exceptions import ValidationError

        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "RUNNING"
        task.save()

        with pytest.raises(ValidationError, match="AgentTask"):
            update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_blocks_if_task_waiting(self, issue, toony_agent, user):
        """Cannot move issue TODO→BACKLOG if agent task is WAITING_FOR_ANSWER."""
        from rest_framework.exceptions import ValidationError

        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "WAITING_FOR_ANSWER"
        task.save()

        with pytest.raises(ValidationError, match="AgentTask"):
            update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_allows_if_task_completed(self, issue, toony_agent, user):
        """Can move issue TODO→BACKLOG if agent task is already COMPLETED."""
        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "COMPLETED"
        task.save()

        update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.BACKLOG

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_backlog_todo_backlog_todo_creates_new_task(self, issue, toony_agent, user):
        """Full cycle: BACKLOG→TODO→BACKLOG→TODO creates a new task each time."""
        update_issue(issue, user, status=IssueStatus.TODO)
        first_task = AgentTask.objects.get(issue=issue, status="QUEUED")

        update_issue(issue, user, status=IssueStatus.BACKLOG)
        first_task.refresh_from_db()
        assert first_task.status == "CANCELLED"

        update_issue(issue, user, status=IssueStatus.TODO)
        queued_tasks = AgentTask.objects.filter(issue=issue, status="QUEUED")
        assert queued_tasks.count() == 1
        assert queued_tasks.first().id != first_task.id
