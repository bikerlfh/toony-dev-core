import pytest
from rest_framework import status

pytestmark = pytest.mark.django_db

FAKE_UUID = "00000000-0000-0000-0000-000000000000"


def workflows_url():
    return "/api/workflows/"


def workflow_url(workflow_id):
    return f"/api/workflows/{workflow_id}/"


class TestWorkflowList:
    def test_list_workflows(self, authenticated_client, workflow):
        response = authenticated_client.get(workflows_url())
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_workflows_unauthenticated(self, api_client):
        response = api_client.get(workflows_url())
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_workflow(self, authenticated_client):
        data = {"name": "My Workflow", "slug": "my-workflow"}
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Workflow"
        assert response.data["slug"] == "my-workflow"
        assert response.data["is_active"] is True

    def test_create_workflow_with_org(self, authenticated_client, organization):
        data = {
            "name": "Org Workflow",
            "slug": "org-workflow",
            "organization": str(organization.id),
        }
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data["organization"]) == str(organization.id)

    def test_create_workflow_with_project(self, authenticated_client, project):
        data = {
            "name": "Project Workflow",
            "slug": "project-workflow",
            "project": str(project.id),
        }
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data["project"]) == str(project.id)

    def test_create_workflow_missing_name(self, authenticated_client):
        data = {"slug": "no-name"}
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestWorkflowDetail:
    def test_get_workflow(self, authenticated_client, workflow):
        response = authenticated_client.get(workflow_url(workflow.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(workflow.id)

    def test_get_workflow_not_found(self, authenticated_client):
        response = authenticated_client.get(workflow_url(FAKE_UUID))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_workflow(self, authenticated_client, workflow):
        data = {"name": "Updated Name", "is_active": False}
        response = authenticated_client.patch(
            workflow_url(workflow.id), data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Name"
        assert response.data["is_active"] is False

    def test_delete_workflow(self, authenticated_client, workflow):
        response = authenticated_client.delete(workflow_url(workflow.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
