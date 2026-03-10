import pytest
from rest_framework import status

from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

LOGIN_URL = "/api/auth/login/"
REFRESH_URL = "/api/auth/refresh/"
ME_URL = "/api/auth/me/"
CHANGE_PASSWORD_URL = "/api/auth/me/change-password/"


class TestLogin:
    def test_login_success(self, api_client):
        UserFactory(username="loginuser")
        data = {"username": "loginuser", "password": "testpass123"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["username"] == "loginuser"

    def test_login_wrong_password(self, api_client):
        UserFactory(username="wrongpw")
        data = {"username": "wrongpw", "password": "badpassword"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_nonexistent_user(self, api_client):
        data = {"username": "noone", "password": "whatever123"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestRegisterRemoved:
    def test_register_endpoint_gone(self, api_client):
        response = api_client.post("/api/auth/register/", {})
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestTokenRefresh:
    def test_refresh_valid(self, api_client):
        UserFactory(username="refreshuser")
        login = api_client.post(LOGIN_URL, {"username": "refreshuser", "password": "testpass123"})
        refresh_token = login.data["refresh"]
        response = api_client.post(REFRESH_URL, {"refresh": refresh_token})
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data

    def test_refresh_invalid(self, api_client):
        response = api_client.post(REFRESH_URL, {"refresh": "invalid-token"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestMe:
    def test_me_authenticated(self, authenticated_client, user):
        response = authenticated_client.get(ME_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["username"] == user.username

    def test_me_unauthenticated(self, api_client):
        response = api_client.get(ME_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestUpdateProfile:
    def test_update_profile(self, authenticated_client):
        response = authenticated_client.put(
            ME_URL,
            {"first_name": "Updated", "last_name": "Name", "email": "new@test.com"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["first_name"] == "Updated"
        assert response.data["last_name"] == "Name"
        assert response.data["email"] == "new@test.com"

    def test_update_profile_partial(self, authenticated_client):
        response = authenticated_client.put(ME_URL, {"first_name": "OnlyFirst"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["first_name"] == "OnlyFirst"

    def test_update_profile_unauthenticated(self, api_client):
        response = api_client.put(ME_URL, {"first_name": "Nope"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestChangePassword:
    def test_change_password_success(self, authenticated_client):
        response = authenticated_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "testpass123", "new_password": "NewStrong456!"},
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_change_password_wrong_current(self, authenticated_client):
        response = authenticated_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "wrongpassword", "new_password": "NewStrong456!"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_change_password_weak_new(self, authenticated_client):
        response = authenticated_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "testpass123", "new_password": "123"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_change_password_unauthenticated(self, api_client):
        response = api_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "x", "new_password": "y"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
