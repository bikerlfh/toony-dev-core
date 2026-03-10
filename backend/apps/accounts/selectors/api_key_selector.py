from accounts.models import UserAPIKey


def list_user_api_keys(user):
    return UserAPIKey.objects.filter(user=user).order_by("-created_at")


def get_api_key_by_id(user, key_id):
    return UserAPIKey.objects.filter(user=user, id=key_id).first()
