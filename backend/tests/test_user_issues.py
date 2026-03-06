import pytest
from rest_framework import status

from tests.factories import (
    IssueFactory,
    MembershipFactory,
    OrganizationFactory,
    OrganizationSettingsFactory,
    ProjectFactory,
    ProjectMembershipFactory,
    ProjectSettingsFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = "/api/issues/"


class TestUserIssueList:
    def test_unauthenticated(self, api_client):
        response = api_client.get(URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_issues_across_projects(
        self, authenticated_client, user, organization
    ):
        # Create two projects with issues
        p1 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p1)
        ProjectMembershipFactory(project=p1, user=user, role="LEAD")

        p2 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p2)
        ProjectMembershipFactory(project=p2, user=user, role="LEAD")

        IssueFactory(project=p1, reporter=user)
        IssueFactory(project=p2, reporter=user)

        response = authenticated_client.get(URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_excludes_issues_from_non_member_projects(
        self, authenticated_client, user, organization
    ):
        # Project user is NOT a member of
        other_user = UserFactory()
        p_other = ProjectFactory(organization=organization, lead=other_user)
        ProjectSettingsFactory(project=p_other)
        ProjectMembershipFactory(project=p_other, user=other_user, role="LEAD")
        IssueFactory(project=p_other, reporter=other_user)

        # Project user IS a member of
        p_mine = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p_mine)
        ProjectMembershipFactory(project=p_mine, user=user, role="LEAD")
        IssueFactory(project=p_mine, reporter=user)

        response = authenticated_client.get(URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_filter_by_status(self, authenticated_client, user, organization):
        p = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p)
        ProjectMembershipFactory(project=p, user=user, role="LEAD")

        IssueFactory(project=p, reporter=user, status="TODO")
        IssueFactory(project=p, reporter=user, status="DONE")

        response = authenticated_client.get(URL, {"status": "TODO"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["status"] == "TODO"

    def test_filter_by_project_id(self, authenticated_client, user, organization):
        p1 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p1)
        ProjectMembershipFactory(project=p1, user=user, role="LEAD")

        p2 = ProjectFactory(organization=organization, lead=user)
        ProjectSettingsFactory(project=p2)
        ProjectMembershipFactory(project=p2, user=user, role="LEAD")

        IssueFactory(project=p1, reporter=user)
        IssueFactory(project=p2, reporter=user)

        response = authenticated_client.get(URL, {"project_id": str(p1.id)})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["project_id"] == str(p1.id)

    def test_response_includes_project_info(
        self, authenticated_client, user, organization
    ):
        p = ProjectFactory(
            organization=organization, lead=user, color="#FF0000", icon="bug"
        )
        ProjectSettingsFactory(project=p)
        ProjectMembershipFactory(project=p, user=user, role="LEAD")
        IssueFactory(project=p, reporter=user)

        response = authenticated_client.get(URL)
        assert response.status_code == status.HTTP_200_OK
        issue = response.data["results"][0]
        assert "project" in issue
        assert issue["project"]["name"] == p.name
        assert issue["project"]["color"] == "#FF0000"
        assert issue["project"]["icon"] == "bug"
