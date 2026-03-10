from django.contrib.auth import authenticate
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework_simplejwt.tokens import RefreshToken


def authenticate_user(username, password):
    user = authenticate(username=username, password=password)
    if user is None:
        raise AuthenticationFailed("Invalid username or password.")

    refresh = RefreshToken.for_user(user)
    return {
        "user": user,
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def update_profile(user, **fields):
    for key, value in fields.items():
        setattr(user, key, value)
    user.save(update_fields=list(fields.keys()) + ["updated_at"])
    return user


def change_password(user, current_password, new_password):
    if not user.check_password(current_password):
        raise ValidationError({"current_password": ["Current password is incorrect."]})
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
