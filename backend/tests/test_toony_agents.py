import pytest
from rest_framework import status

pytestmark = pytest.mark.django_db


class TestToonyAgentModel:
    def test_create_toony_agent(self, user):
        from toony_agents.models import ToonyAgent, ToonyAgentStatus

        agent = ToonyAgent.objects.create(name="Test Bot", slug="test-bot", registered_by=user)
        assert agent.status == ToonyAgentStatus.OFFLINE
        assert agent.metadata == {}
        assert str(agent) == "Test Bot (OFFLINE)"

    def test_toony_agent_organizations_m2m(self, user, organization):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(name="Multi-Org Bot", slug="multi-org-bot", registered_by=user)
        agent.organizations.add(organization)
        assert organization in agent.organizations.all()
        assert agent in organization.toony_agents.all()

    def test_create_agent_task(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(name="Bot", slug="task-model-bot", registered_by=user)
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

        agent = ToonyAgent.objects.create(name="Bot", slug="event-bot", registered_by=user)
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
        from toony_agents.models import ToonyAgent
        from toony_agents.services import generate_api_key, verify_api_key

        agent = ToonyAgent.objects.create(name="Bot", slug="svc-bot", registered_by=user)
        key_obj, raw_key = generate_api_key(agent, user, name="test-key")
        assert raw_key.startswith("tok_ta_")
        assert key_obj.key_prefix == raw_key[:12]
        verified = verify_api_key(raw_key)
        assert verified == agent
        assert verify_api_key("tok_ta_invalid") is None

    def test_revoke_api_key(self, user):
        from toony_agents.models import ToonyAgent
        from toony_agents.services import generate_api_key, revoke_api_key, verify_api_key

        agent = ToonyAgent.objects.create(name="Bot", slug="revoke-bot", registered_by=user)
        key_obj, raw_key = generate_api_key(agent, user)
        revoke_api_key(key_obj)
        assert verify_api_key(raw_key) is None


class TestAgentTaskService:
    def test_create_task(self, user, organization):
        from toony_agents.models import AgentTaskStatus, ToonyAgent
        from toony_agents.services import create_agent_task

        agent = ToonyAgent.objects.create(name="Bot", slug="task-svc-bot", registered_by=user)
        task = create_agent_task(
            organization=organization,
            toony_agent=agent,
            created_by=user,
            title="Fix bug",
            prompt="Fix the login bug",
        )
        assert task.status == AgentTaskStatus.QUEUED
        assert task.toony_agent == agent

    def test_update_task_status(self, user, organization):
        from toony_agents.models import AgentTaskStatus, ToonyAgent
        from toony_agents.services import create_agent_task, update_task_status

        agent = ToonyAgent.objects.create(name="Bot", slug="status-svc-bot", registered_by=user)
        task = create_agent_task(
            organization=organization,
            toony_agent=agent,
            created_by=user,
            title="Task",
            prompt="Do something",
        )
        task = update_task_status(task, AgentTaskStatus.RUNNING)
        assert task.status == AgentTaskStatus.RUNNING
        assert task.started_at is not None

    def test_create_task_event(self, user, organization):
        from toony_agents.models import TaskEventType, ToonyAgent
        from toony_agents.services import create_agent_task, create_task_event

        agent = ToonyAgent.objects.create(name="Bot", slug="event-svc-bot", registered_by=user)
        task = create_agent_task(
            organization=organization,
            toony_agent=agent,
            created_by=user,
            title="Task",
            prompt="Do it",
        )
        event = create_task_event(task, TaskEventType.LOG, {"msg": "hello"}, 1)
        assert event.event_type == TaskEventType.LOG
        assert event.sequence == 1


def toony_agents_url():
    return "/api/toony-agents/"


def toony_agent_url(agent_id):
    return f"/api/toony-agents/{agent_id}/"


def keys_url(agent_id):
    return f"/api/toony-agents/{agent_id}/keys/"


def tasks_url(agent_id):
    return f"/api/toony-agents/{agent_id}/tasks/"


class TestToonyAgentAPI:
    def test_create_toony_agent(self, authenticated_client, organization):
        url = toony_agents_url()
        data = {
            "name": "My Bot",
            "slug": "my-bot",
            "organization_id": str(organization.id),
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Bot"
        assert response.data["slug"] == "my-bot"

    def test_list_toony_agents(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot",
            slug="list-bot",
            registered_by=user,
        )
        agent.organizations.add(organization)
        url = toony_agents_url()
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_get_toony_agent(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot",
            slug="get-bot",
            registered_by=user,
        )
        agent.organizations.add(organization)
        url = toony_agent_url(agent.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["slug"] == "get-bot"

    def test_generate_api_key(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot",
            slug="key-bot",
            registered_by=user,
        )
        agent.organizations.add(organization)
        url = keys_url(agent.id)
        response = authenticated_client.post(url, {"name": "dev"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "raw_key" in response.data
        assert response.data["raw_key"].startswith("tok_ta_")

    def test_create_task(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot",
            slug="task-api-bot",
            registered_by=user,
        )
        agent.organizations.add(organization)
        url = tasks_url(agent.id)
        data = {
            "title": "Fix bug",
            "prompt": "Fix the login bug",
            "toony_agent_slug": "task-api-bot",
            "organization_id": str(organization.id),
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "QUEUED"

    def test_unauthenticated(self, api_client):
        url = toony_agents_url()
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_nonmember_list_returns_empty(self, api_client, organization, other_user):
        """Non-member listing toony agents gets 200 with empty results (no org in URL)."""
        api_client.force_authenticate(user=other_user)
        url = toony_agents_url()
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 0

    def test_nonmember_denied_detail(self, api_client, organization, other_user, user):
        """Non-member accessing a specific agent gets 403."""
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot",
            slug="deny-bot",
            registered_by=user,
        )
        agent.organizations.add(organization)
        api_client.force_authenticate(user=other_user)
        url = toony_agent_url(agent.id)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_toony_agent_includes_organizations(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot",
            slug="org-fields-bot",
            registered_by=user,
        )
        agent.organizations.add(organization)
        url = toony_agent_url(agent.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert "organizations" in response.data
        assert len(response.data["organizations"]) == 1
        org_data = response.data["organizations"][0]
        assert str(organization.id) == org_data["id"]
        assert organization.name == org_data["name"]
        assert organization.slug == org_data["slug"]


class TestAgentSystemEventAPI:
    def test_list_system_events(self, authenticated_client, toony_agent):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            data={"repository_url": "https://github.com/org/repo.git"},
        )

        response = authenticated_client.get(
            f"/api/toony-agents/{toony_agent.id}/system-events/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["event_type"] == "REPO_CLONE_SUCCESS"

    def test_list_system_events_filter_by_event_type(self, authenticated_client, toony_agent):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            data={},
        )
        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_ERROR,
            data={},
        )

        response = authenticated_client.get(
            f"/api/toony-agents/{toony_agent.id}/system-events/?event_type=REPO_CLONE_ERROR"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["event_type"] == "REPO_CLONE_ERROR"

    def test_list_system_events_filter_by_project(self, authenticated_client, toony_agent, project):
        from tests.factories import ProjectFactory
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            project=project,
            data={},
        )
        other_project = ProjectFactory(organization=project.organization)
        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            project=other_project,
            data={},
        )

        response = authenticated_client.get(
            f"/api/toony-agents/{toony_agent.id}/system-events/?project_id={project.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
