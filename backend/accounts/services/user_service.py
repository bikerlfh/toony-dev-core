from django.contrib.auth import authenticate
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from accounts.selectors import get_user_by_email
from common.exceptions import ConflictError


def create_user(email, password, **extra_fields):
    if get_user_by_email(email):
        raise ConflictError("A user with this email already exists.")

    return User.objects.create_user(email=email, password=password, **extra_fields)


def authenticate_user(email, password):
    user = authenticate(email=email, password=password)
    if user is None:
        raise AuthenticationFailed("Invalid email or password.")

    refresh = RefreshToken.for_user(user)
    return {
        "user": user,
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }
