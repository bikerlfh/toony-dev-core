import pytest
from rest_framework import status

from tests.factories import (
    IssueCommentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

FAKE_UUID = "00000000-0000-0000-0000-000000000000"


def full_detail_url(issue_id):
    return f"/api/issues/{issue_id}/"


class TestIssueFullDetail:
    def test_get_by_uuid(self, authenticated_client, organization, project, issue):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(issue.id)
        assert response.data["identifier"] == issue.identifier
        assert "project" in response.data
        assert response.data["project"]["id"] == str(project.id)

    def test_get_by_identifier(self, authenticated_client, organization, project, issue):
        url = full_detail_url(issue.identifier)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["identifier"] == issue.identifier

    def test_includes_comments(
        self, authenticated_client, organization, project, issue, user
    ):
        IssueCommentFactory(issue=issue, author=user, body="First comment")
        IssueCommentFactory(issue=issue, author=user, body="Second comment")
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["comments"]) == 2
        assert response.data["comments"][0]["body"] == "First comment"

    def test_includes_activities(
        self, authenticated_client, organization, project, issue
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert "activities" in response.data
        assert isinstance(response.data["activities"], list)

    def test_includes_artifacts(
        self, authenticated_client, organization, project, issue, artifact
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["artifacts"]) == 1
        assert response.data["artifacts"][0]["title"] == artifact.title

    def test_includes_documents(
        self, authenticated_client, organization, project, issue, issue_document
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["documents"]) == 1
        assert response.data["documents"][0]["original_filename"] == issue_document.original_filename

    def test_empty_collections(
        self, authenticated_client, organization, project, issue
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["comments"] == []
        assert response.data["activities"] == []
        assert response.data["artifacts"] == []
        assert response.data["documents"] == []

    def test_not_found_uuid(self, authenticated_client, organization, project):
        url = full_detail_url(FAKE_UUID)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_not_found_identifier(self, authenticated_client, organization, project):
        url = full_detail_url("NONEXIST-999")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated(self, api_client, organization, project, issue):
        url = full_detail_url(issue.id)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_member_forbidden(self, organization, project, issue):
        from rest_framework.test import APIClient

        other_user = UserFactory()
        client = APIClient()
        client.force_authenticate(user=other_user)
        url = full_detail_url(issue.id)
        response = client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
