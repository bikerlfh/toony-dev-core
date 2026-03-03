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


class TestToonyAgentService:
    def test_generate_api_key(self, user):
        from toony_agents.services import generate_api_key, verify_api_key
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(name="Bot", slug="svc-bot", registered_by=user)
        key_obj, raw_key = generate_api_key(agent, user, name="test-key")
        assert raw_key.startswith("tok_ta_")
        assert key_obj.key_prefix == raw_key[:12]
        verified = verify_api_key(raw_key)
        assert verified == agent
        assert verify_api_key("tok_ta_invalid") is None

    def test_revoke_api_key(self, user):
        from toony_agents.services import generate_api_key, revoke_api_key, verify_api_key
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(name="Bot", slug="revoke-bot", registered_by=user)
        key_obj, raw_key = generate_api_key(agent, user)
        revoke_api_key(key_obj)
        assert verify_api_key(raw_key) is None


class TestAgentTaskService:
    def test_create_task(self, user, organization):
        from toony_agents.services import create_agent_task
        from toony_agents.models import ToonyAgent, AgentTaskStatus
        agent = ToonyAgent.objects.create(name="Bot", slug="task-svc-bot", registered_by=user)
        task = create_agent_task(
            organization=organization, toony_agent=agent, created_by=user,
            title="Fix bug", prompt="Fix the login bug",
        )
        assert task.status == AgentTaskStatus.QUEUED
        assert task.toony_agent == agent

    def test_update_task_status(self, user, organization):
        from toony_agents.services import create_agent_task, update_task_status
        from toony_agents.models import ToonyAgent, AgentTaskStatus
        agent = ToonyAgent.objects.create(name="Bot", slug="status-svc-bot", registered_by=user)
        task = create_agent_task(
            organization=organization, toony_agent=agent, created_by=user,
            title="Task", prompt="Do something",
        )
        task = update_task_status(task, AgentTaskStatus.RUNNING)
        assert task.status == AgentTaskStatus.RUNNING
        assert task.started_at is not None

    def test_create_task_event(self, user, organization):
        from toony_agents.services import create_agent_task, create_task_event
        from toony_agents.models import ToonyAgent, TaskEventType
        agent = ToonyAgent.objects.create(name="Bot", slug="event-svc-bot", registered_by=user)
        task = create_agent_task(
            organization=organization, toony_agent=agent, created_by=user,
            title="Task", prompt="Do it",
        )
        event = create_task_event(task, TaskEventType.LOG, {"msg": "hello"}, 1)
        assert event.event_type == TaskEventType.LOG
        assert event.sequence == 1


def toony_agents_url(org_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/"


def toony_agent_url(org_slug, agent_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/{agent_slug}/"


def keys_url(org_slug, agent_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/{agent_slug}/keys/"


def tasks_url(org_slug, agent_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/{agent_slug}/tasks/"


class TestToonyAgentAPI:
    def test_create_toony_agent(self, authenticated_client, organization):
        url = toony_agents_url(organization.slug)
        data = {"name": "My Bot", "slug": "my-bot"}
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Bot"
        assert response.data["slug"] == "my-bot"

    def test_list_toony_agents(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(
            name="Bot", slug="list-bot", registered_by=user,
        )
        agent.organizations.add(organization)
        url = toony_agents_url(organization.slug)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_get_toony_agent(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(
            name="Bot", slug="get-bot", registered_by=user,
        )
        agent.organizations.add(organization)
        url = toony_agent_url(organization.slug, "get-bot")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["slug"] == "get-bot"

    def test_generate_api_key(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(
            name="Bot", slug="key-bot", registered_by=user,
        )
        agent.organizations.add(organization)
        url = keys_url(organization.slug, "key-bot")
        response = authenticated_client.post(url, {"name": "dev"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "raw_key" in response.data
        assert response.data["raw_key"].startswith("tok_ta_")

    def test_create_task(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(
            name="Bot", slug="task-api-bot", registered_by=user,
        )
        agent.organizations.add(organization)
        url = tasks_url(organization.slug, "task-api-bot")
        data = {
            "title": "Fix bug",
            "prompt": "Fix the login bug",
            "toony_agent_slug": "task-api-bot",
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "QUEUED"

    def test_unauthenticated(self, api_client, organization):
        url = toony_agents_url(organization.slug)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_nonmember_denied(self, api_client, organization, other_user):
        api_client.force_authenticate(user=other_user)
        url = toony_agents_url(organization.slug)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
