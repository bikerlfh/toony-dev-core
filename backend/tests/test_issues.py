import pytest
from rest_framework import status

from tests.factories import IssueCommentFactory, LabelFactory

pytestmark = pytest.mark.django_db


def issues_url(org_slug, project_slug):
    return f"/api/v1/organizations/{org_slug}/projects/{project_slug}/issues/"


def issue_url(org_slug, project_slug, identifier):
    return f"/api/v1/organizations/{org_slug}/projects/{project_slug}/issues/{identifier}/"


def comments_url(org_slug, project_slug, identifier):
    return f"/api/v1/organizations/{org_slug}/projects/{project_slug}/issues/{identifier}/comments/"


def comment_url(org_slug, project_slug, identifier, comment_id):
    return f"/api/v1/organizations/{org_slug}/projects/{project_slug}/issues/{identifier}/comments/{comment_id}/"


class TestIssueList:
    def test_list_issues(self, authenticated_client, organization, project, issue):
        url = issues_url(organization.slug, project.slug)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_create_issue(self, authenticated_client, organization, project):
        url = issues_url(organization.slug, project.slug)
        data = {"title": "New Issue", "description": "A test issue"}
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "New Issue"

    def test_create_issue_with_labels(
        self, authenticated_client, organization, project
    ):
        label = LabelFactory()
        url = issues_url(organization.slug, project.slug)
        data = {
            "title": "Labeled Issue",
            "label_ids": [str(label.id)],
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data["labels"]) == 1

    def test_create_issue_missing_title(
        self, authenticated_client, organization, project
    ):
        url = issues_url(organization.slug, project.slug)
        data = {"description": "No title"}
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_issue_unauthenticated(self, api_client, organization, project):
        url = issues_url(organization.slug, project.slug)
        data = {"title": "Unauth Issue"}
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_auto_increment_identifier(
        self, authenticated_client, organization, project
    ):
        url = issues_url(organization.slug, project.slug)
        r1 = authenticated_client.post(url, {"title": "First"}, format="json")
        r2 = authenticated_client.post(url, {"title": "Second"}, format="json")
        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code == status.HTTP_201_CREATED
        # Identifiers should be sequential
        id1 = r1.data["identifier"]
        id2 = r2.data["identifier"]
        prefix1 = id1.rsplit("-", 1)[0]
        prefix2 = id2.rsplit("-", 1)[0]
        num1 = int(id1.rsplit("-", 1)[1])
        num2 = int(id2.rsplit("-", 1)[1])
        assert prefix1 == prefix2
        assert num2 == num1 + 1


class TestIssueDetail:
    def test_get_issue(self, authenticated_client, organization, project, issue):
        url = issue_url(organization.slug, project.slug, issue.identifier)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["identifier"] == issue.identifier

    def test_update_issue(self, authenticated_client, organization, project, issue):
        url = issue_url(organization.slug, project.slug, issue.identifier)
        data = {"title": "Updated Issue Title"}
        response = authenticated_client.put(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "Updated Issue Title"

    def test_delete_issue(self, authenticated_client, organization, project, issue):
        url = issue_url(organization.slug, project.slug, issue.identifier)
        response = authenticated_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_issue_not_found(self, authenticated_client, organization, project):
        url = issue_url(organization.slug, project.slug, "FAKE-999")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_title_allowed_in_backlog(
        self, authenticated_client, organization, project, issue
    ):
        issue.status = "BACKLOG"
        issue.save()
        url = issue_url(organization.slug, project.slug, issue.identifier)
        data = {"title": "New Title"}
        response = authenticated_client.put(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "New Title"

    def test_update_title_allowed_in_todo(
        self, authenticated_client, organization, project, issue
    ):
        issue.status = "TODO"
        issue.save()
        url = issue_url(organization.slug, project.slug, issue.identifier)
        data = {"title": "New Title"}
        response = authenticated_client.put(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "New Title"

    def test_update_title_rejected_in_progress(
        self, authenticated_client, organization, project, issue
    ):
        issue.status = "IN_PROGRESS"
        issue.save()
        url = issue_url(organization.slug, project.slug, issue.identifier)
        data = {"title": "Should Fail"}
        response = authenticated_client.put(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_description_rejected_in_done(
        self, authenticated_client, organization, project, issue
    ):
        issue.status = "DONE"
        issue.save()
        url = issue_url(organization.slug, project.slug, issue.identifier)
        data = {"description": "Should Fail"}
        response = authenticated_client.put(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_status_still_works_in_progress(
        self, authenticated_client, organization, project, issue
    ):
        issue.status = "IN_PROGRESS"
        issue.save()
        url = issue_url(organization.slug, project.slug, issue.identifier)
        data = {"priority": "HIGH"}
        response = authenticated_client.put(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["priority"] == "HIGH"


class TestIssueComments:
    def test_list_comments(self, authenticated_client, organization, project, issue):
        IssueCommentFactory(issue=issue, author=issue.reporter)
        url = comments_url(organization.slug, project.slug, issue.identifier)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_create_comment(self, authenticated_client, organization, project, issue):
        url = comments_url(organization.slug, project.slug, issue.identifier)
        data = {"body": "A new comment"}
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["body"] == "A new comment"

    def test_create_comment_empty_body(
        self, authenticated_client, organization, project, issue
    ):
        url = comments_url(organization.slug, project.slug, issue.identifier)
        data = {"body": ""}
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_comment(self, authenticated_client, organization, project, issue):
        comment = IssueCommentFactory(issue=issue, author=issue.reporter)
        url = comment_url(
            organization.slug, project.slug, issue.identifier, comment.id
        )
        response = authenticated_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
