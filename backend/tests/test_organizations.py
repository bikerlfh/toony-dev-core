import pytest
from rest_framework import status

from tests.factories import MembershipFactory, UserFactory

pytestmark = pytest.mark.django_db

ORGS_URL = "/api/organizations/"


def org_url(org_id):
    return f"{ORGS_URL}{org_id}/"


def members_url(org_id):
    return f"{ORGS_URL}{org_id}/members/"


def member_url(org_id, user_id):
    return f"{ORGS_URL}{org_id}/members/{user_id}/"


class TestOrganizationList:
    def test_list_organizations(self, authenticated_client, organization):
        response = authenticated_client.get(ORGS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_organization(self, authenticated_client):
        data = {"name": "New Org", "slug": "new-org"}
        response = authenticated_client.post(ORGS_URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["slug"] == "new-org"

    def test_create_duplicate_slug(self, authenticated_client, organization):
        data = {"name": "Dup Org", "slug": organization.slug}
        response = authenticated_client.post(ORGS_URL, data)
        assert response.status_code == status.HTTP_409_CONFLICT

    def test_list_unauthenticated(self, api_client):
        response = api_client.get(ORGS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestOrganizationDetail:
    def test_get_organization(self, authenticated_client, organization):
        response = authenticated_client.get(org_url(organization.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["slug"] == organization.slug

    def test_update_organization(self, authenticated_client, organization):
        data = {"name": "Updated Org"}
        response = authenticated_client.put(
            org_url(organization.id), data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Org"

    def test_delete_organization(self, authenticated_client, organization):
        response = authenticated_client.delete(org_url(organization.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_non_member_forbidden(self, api_client, organization):
        non_member = UserFactory()
        api_client.force_authenticate(user=non_member)
        response = api_client.get(org_url(organization.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestOrganizationMembers:
    def test_list_members(self, authenticated_client, organization):
        response = authenticated_client.get(members_url(organization.id))
        assert response.status_code == status.HTTP_200_OK

    def test_add_member(self, authenticated_client, organization):
        new_user = UserFactory()
        data = {"email": new_user.email, "role": "MEMBER"}
        response = authenticated_client.post(
            members_url(organization.id), data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_remove_member(self, authenticated_client, organization):
        member_user = UserFactory()
        MembershipFactory(
            user=member_user, organization=organization, role="MEMBER"
        )
        response = authenticated_client.delete(
            member_url(organization.id, member_user.id)
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_add_existing_member(self, authenticated_client, organization, user):
        data = {"email": user.email, "role": "MEMBER"}
        response = authenticated_client.post(
            members_url(organization.id), data, format="json"
        )
        assert response.status_code == status.HTTP_409_CONFLICT
