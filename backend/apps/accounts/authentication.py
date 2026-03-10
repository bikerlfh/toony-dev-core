import hashlib

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from accounts.models import UserAPIKey


class APIKeyAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate_header(self, request):
        return self.keyword

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith(f"{self.keyword} "):
            return None

        token = auth_header[len(self.keyword) + 1 :]
        if not token.startswith("toony_"):
            return None

        key_hash = hashlib.sha256(token.encode()).hexdigest()
        try:
            api_key = UserAPIKey.objects.select_related("user").get(
                key_hash=key_hash,
                is_active=True,
            )
        except UserAPIKey.DoesNotExist:
            raise AuthenticationFailed("Invalid or revoked API key.")

        api_key.last_used_at = timezone.now()
        api_key.save(update_fields=["last_used_at"])

        return (api_key.user, api_key)
