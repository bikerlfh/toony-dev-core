import pytest
from rest_framework import status

from tests.factories import ToonyAgentFactory, ToonyAgentKeyFactory, AgentTaskFactory

pytestmark = pytest.mark.django_db


class TestToonyAgentModel:
    def test_create_toony_agent(self, user):
        from toony_agents.models import ToonyAgent, ToonyAgentStatus

        agent = ToonyAgent.objects.create(
            name="Test Bot", slug="test-bot", registered_by=user
        )
        assert agent.status == ToonyAgentStatus.OFFLINE
        assert agent.metadata == {}
        assert str(agent) == "Test Bot (OFFLINE)"

    def test_toony_agent_organizations_m2m(self, user, organization):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Multi-Org Bot", slug="multi-org-bot", registered_by=user
        )
        agent.organizations.add(organization)
        assert organization in agent.organizations.all()
        assert agent in organization.toony_agents.all()

    def test_create_agent_task(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot", slug="task-model-bot", registered_by=user
        )
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Fix bug",
            prompt="Fix the login bug",
            created_by=user,
        )
        assert task.status == AgentTaskStatus.QUEUED
        assert task.toony_agent == agent

    def test_create_task_event(self, user, organization):
        from toony_agents.models import (
            AgentTask,
            TaskEvent,
            TaskEventType,
            ToonyAgent,
        )

        agent = ToonyAgent.objects.create(
            name="Bot", slug="event-bot", registered_by=user
        )
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Task",
            prompt="Do it",
            created_by=user,
        )
        event = TaskEvent.objects.create(
            task=task,
            event_type=TaskEventType.LOG,
            data={"message": "hello"},
            sequence=1,
        )
        assert event.event_type == TaskEventType.LOG
        assert event.sequence == 1
