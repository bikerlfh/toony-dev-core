import pytest
from rest_framework import status

from tests.factories import (
    AgentTaskFactory,
    IssueArtifactFactory,
    ToonyAgentFactory,
)

pytestmark = pytest.mark.django_db


def artifacts_url(project_id, issue_id):
    return f"/api/projects/{project_id}/issues/{issue_id}/artifacts/"


def artifact_detail_url(project_id, issue_id, artifact_id):
    return f"/api/projects/{project_id}/issues/{issue_id}/artifacts/{artifact_id}/"


class TestIssueArtifactList:
    def test_list_artifacts(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        IssueArtifactFactory(issue=issue, agent_task=task)
        IssueArtifactFactory(issue=issue, agent_task=task)

        url = artifacts_url(project.id, issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_create_artifact(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )

        url = artifacts_url(project.id, issue.id)
        data = {
            "title": "Implementation Plan",
            "artifact_type": "PLAN",
            "content": "# Plan\n\nStep 1...",
            "session_id": "sess_abc123",
            "agent_task_id": str(task.id),
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Implementation Plan"
        assert response.data["status"] == "DRAFT"

    def test_create_artifact_with_approval(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )

        url = artifacts_url(project.id, issue.id)
        data = {
            "title": "Design Doc",
            "artifact_type": "DESIGN_DOC",
            "content": "# Design",
            "session_id": "sess_abc123",
            "agent_task_id": str(task.id),
            "requires_approval": True,
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING_APPROVAL"


class TestIssueArtifactDetail:
    def test_get_artifact(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        artifact = IssueArtifactFactory(issue=issue, agent_task=task)

        url = artifact_detail_url(project.id, issue.id, artifact.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(artifact.id)
        assert "content" in response.data
        assert "issue" in response.data
        assert "agent_task" in response.data

    def test_update_artifact_status(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        artifact = IssueArtifactFactory(issue=issue, agent_task=task)

        url = artifact_detail_url(project.id, issue.id, artifact.id)
        response = authenticated_client.patch(url, {"status": "PENDING_APPROVAL"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PENDING_APPROVAL"

    def test_invalid_status_transition(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        artifact = IssueArtifactFactory(issue=issue, agent_task=task)
        # DRAFT -> APPROVED is not valid
        url = artifact_detail_url(project.id, issue.id, artifact.id)
        response = authenticated_client.patch(url, {"status": "APPROVED"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_artifact(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        artifact = IssueArtifactFactory(issue=issue, agent_task=task)

        url = artifact_detail_url(project.id, issue.id, artifact.id)
        response = authenticated_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestGlobalArtifactEndpoints:
    def test_list_all_artifacts(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        IssueArtifactFactory(issue=issue, agent_task=task)

        response = authenticated_client.get("/api/artifacts/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_list_artifacts_with_filters(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        IssueArtifactFactory(issue=issue, agent_task=task, artifact_type="PLAN")
        IssueArtifactFactory(issue=issue, agent_task=task, artifact_type="DESIGN_DOC")

        response = authenticated_client.get("/api/artifacts/?artifact_type=PLAN")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["artifact_type"] == "PLAN"

    def test_get_artifact_global(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        artifact = IssueArtifactFactory(issue=issue, agent_task=task)

        response = authenticated_client.get(f"/api/artifacts/{artifact.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(artifact.id)


class TestArtifactSupersede:
    def test_creating_same_type_supersedes_approved(self, authenticated_client, organization, project, issue):
        agent = ToonyAgentFactory(registered_by=issue.reporter)
        task = AgentTaskFactory(
            organization=organization,
            project=project,
            toony_agent=agent,
            created_by=issue.reporter,
        )
        first = IssueArtifactFactory(
            issue=issue,
            agent_task=task,
            artifact_type="PLAN",
            status="APPROVED",
        )

        url = artifacts_url(project.id, issue.id)
        data = {
            "title": "Plan v2",
            "artifact_type": "PLAN",
            "content": "# Updated Plan",
            "session_id": "sess_new",
            "agent_task_id": str(task.id),
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        first.refresh_from_db()
        assert first.status == "SUPERSEDED"
