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
