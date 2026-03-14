import pytest
from rest_framework import status

from accounts.selectors.api_key_selector import (
    get_api_key_by_id,
    list_user_api_keys,
)
from accounts.services.api_key_service import generate_api_key, revoke_api_key
from tests.factories import UserFactory

API_KEYS_URL = "/api/auth/api-keys/"


def api_key_detail_url(key_id):
    return f"{API_KEYS_URL}{key_id}/"


@pytest.mark.django_db
class TestAPIKeyService:
    def test_generate_api_key(self, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")

        assert raw_key.startswith("toony_")
        assert len(raw_key) == 46  # "toony_" + 40 hex chars
        assert key_obj.key_prefix == raw_key[:8]
        assert key_obj.name == "test-key"
        assert key_obj.is_active is True
        assert key_obj.user == user

    def test_generate_api_key_stores_hash_not_raw(self, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")

        assert key_obj.key_hash != raw_key
        assert len(key_obj.key_hash) == 64  # SHA-256 hex

    def test_revoke_api_key(self, user):
        key_obj, _ = generate_api_key(user=user, name="test-key")
        revoke_api_key(key_obj)

        key_obj.refresh_from_db()
        assert key_obj.is_active is False


@pytest.mark.django_db
class TestAPIKeySelector:
    def test_list_user_api_keys(self, user):
        generate_api_key(user=user, name="key-1")
        generate_api_key(user=user, name="key-2")
        other_user = UserFactory()
        generate_api_key(user=other_user, name="other-key")

        keys = list_user_api_keys(user)
        assert keys.count() == 2

    def test_get_api_key_by_id(self, user):
        key_obj, _ = generate_api_key(user=user, name="test-key")

        found = get_api_key_by_id(user, key_obj.id)
        assert found is not None
        assert found.id == key_obj.id

    def test_get_api_key_by_id_wrong_user(self, user):
        other_user = UserFactory()
        key_obj, _ = generate_api_key(user=other_user, name="test-key")

        found = get_api_key_by_id(user, key_obj.id)
        assert found is None


@pytest.mark.django_db
class TestAPIKeyAuthentication:
    def test_authenticate_with_valid_key(self, api_client, user):
        _, raw_key = generate_api_key(user=user, name="test-key")

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        response = api_client.get("/api/auth/me/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(user.id)

    def test_authenticate_with_invalid_key(self, api_client):
        api_client.credentials(HTTP_AUTHORIZATION="Bearer toony_invalidkey12345678901234567890")
        response = api_client.get("/api/auth/me/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticate_with_revoked_key(self, api_client, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")
        revoke_api_key(key_obj)

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        response = api_client.get("/api/auth/me/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticate_updates_last_used_at(self, api_client, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")
        assert key_obj.last_used_at is None

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        api_client.get("/api/auth/me/")

        key_obj.refresh_from_db()
        assert key_obj.last_used_at is not None

    def test_jwt_still_works(self, authenticated_client):
        response = authenticated_client.get("/api/auth/me/")
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestAPIKeyEndpoints:
    def test_create_api_key(self, authenticated_client):
        response = authenticated_client.post(API_KEYS_URL, {"name": "my-key"})

        assert response.status_code == status.HTTP_201_CREATED
        assert "raw_key" in response.data
        assert response.data["raw_key"].startswith("toony_")
        assert response.data["name"] == "my-key"
        assert response.data["key_prefix"] == response.data["raw_key"][:8]

    def test_create_api_key_requires_name(self, authenticated_client):
        response = authenticated_client.post(API_KEYS_URL, {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_api_keys(self, authenticated_client, user):
        generate_api_key(user=user, name="key-1")
        generate_api_key(user=user, name="key-2")

        response = authenticated_client.get(API_KEYS_URL)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2
        for key_data in response.data["results"]:
            assert "raw_key" not in key_data
            assert "key_hash" not in key_data

    def test_revoke_api_key_endpoint(self, authenticated_client, user):
        key_obj, _ = generate_api_key(user=user, name="to-revoke")

        response = authenticated_client.delete(api_key_detail_url(key_obj.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        key_obj.refresh_from_db()
        assert key_obj.is_active is False

    def test_revoke_other_users_key_returns_404(self, authenticated_client):
        other_user = UserFactory()
        key_obj, _ = generate_api_key(user=other_user, name="not-mine")

        response = authenticated_client.delete(api_key_detail_url(key_obj.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_create_key(self, api_client):
        response = api_client.post(API_KEYS_URL, {"name": "test"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
