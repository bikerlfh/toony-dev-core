import pytest
from rest_framework import status

from accounts.models import UserAPIKey
from accounts.services.api_key_service import generate_api_key, revoke_api_key
from accounts.selectors.api_key_selector import list_user_api_keys, get_api_key_by_id
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
