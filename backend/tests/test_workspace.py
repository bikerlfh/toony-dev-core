import pytest
from rest_framework import status

from tests.factories import LabelFactory, TeamFactory, TeamMembershipFactory

pytestmark = pytest.mark.django_db

LABELS_URL = "/api/workspace/labels/"
TEAMS_URL = "/api/workspace/teams/"


def label_url(label_id):
    return f"/api/workspace/labels/{label_id}/"


def team_url(team_id):
    return f"/api/workspace/teams/{team_id}/"


def team_members_url(team_id):
    return f"/api/workspace/teams/{team_id}/members/"


class TestWorkspaceLabels:
    def test_list_labels(self, authenticated_client, organization):
        LabelFactory()
        response = authenticated_client.get(LABELS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_create_label(self, authenticated_client, organization):
        data = {"name": "Bug", "color": "#ef4444"}
        response = authenticated_client.post(LABELS_URL, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Bug"

    def test_update_label(self, authenticated_client, organization):
        label = LabelFactory()
        data = {"name": "Updated"}
        response = authenticated_client.put(label_url(label.id), data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated"

    def test_delete_label(self, authenticated_client, organization):
        label = LabelFactory()
        response = authenticated_client.delete(label_url(label.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_unauthenticated(self, api_client):
        response = api_client.get(LABELS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestWorkspaceTeams:
    def test_list_teams(self, authenticated_client, organization):
        TeamFactory()
        response = authenticated_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_create_team(self, authenticated_client, organization):
        data = {
            "name": "Engineering",
            "slug": "engineering",
            "identifier": "ENG",
        }
        response = authenticated_client.post(TEAMS_URL, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Engineering"

    def test_get_team(self, authenticated_client, organization):
        team = TeamFactory()
        response = authenticated_client.get(team_url(team.id))
        assert response.status_code == status.HTTP_200_OK

    def test_update_team(self, authenticated_client, organization):
        team = TeamFactory()
        data = {"name": "Updated Team"}
        response = authenticated_client.put(team_url(team.id), data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Team"

    def test_delete_team(self, authenticated_client, organization):
        team = TeamFactory()
        response = authenticated_client.delete(team_url(team.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_list_team_members(self, authenticated_client, organization):
        team = TeamFactory()
        TeamMembershipFactory(team=team)
        response = authenticated_client.get(team_members_url(team.id))
        assert response.status_code == status.HTTP_200_OK

    def test_unauthenticated(self, api_client):
        response = api_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
