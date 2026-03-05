import pytest
from rest_framework import status

from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/login/"
REFRESH_URL = "/api/auth/refresh/"
ME_URL = "/api/auth/me/"


class TestRegister:
    def test_register_success(self, api_client):
        data = {
            "email": "new@test.com",
            "password": "StrongPass123!",
            "first_name": "New",
            "last_name": "User",
        }
        response = api_client.post(REGISTER_URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["email"] == "new@test.com"

    def test_register_duplicate_email(self, api_client):
        UserFactory(email="dup@test.com")
        data = {
            "email": "dup@test.com",
            "password": "StrongPass123!",
            "first_name": "Dup",
            "last_name": "User",
        }
        response = api_client.post(REGISTER_URL, data)
        assert response.status_code == status.HTTP_409_CONFLICT

    def test_register_weak_password(self, api_client):
        data = {
            "email": "weak@test.com",
            "password": "123",
            "first_name": "Weak",
            "last_name": "User",
        }
        response = api_client.post(REGISTER_URL, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_missing_fields(self, api_client):
        response = api_client.post(REGISTER_URL, {"email": "only@test.com"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestLogin:
    def test_login_success(self, api_client):
        UserFactory(email="login@test.com")
        data = {"email": "login@test.com", "password": "testpass123"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data

    def test_login_wrong_password(self, api_client):
        UserFactory(email="wrong@test.com")
        data = {"email": "wrong@test.com", "password": "badpassword"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_nonexistent_user(self, api_client):
        data = {"email": "noone@test.com", "password": "whatever123"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestTokenRefresh:
    def test_refresh_valid(self, api_client):
        UserFactory(email="refresh@test.com")
        login = api_client.post(
            LOGIN_URL, {"email": "refresh@test.com", "password": "testpass123"}
        )
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
        assert response.data["email"] == user.email

    def test_me_unauthenticated(self, api_client):
        response = api_client.get(ME_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
