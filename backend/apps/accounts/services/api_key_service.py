import hashlib
import secrets

from accounts.models import UserAPIKey


def generate_api_key(*, user, name):
    raw_key = f"toony_{secrets.token_hex(20)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]

    key_obj = UserAPIKey.objects.create(
        user=user,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=name,
    )
    return key_obj, raw_key


def revoke_api_key(api_key):
    api_key.is_active = False
    api_key.save(update_fields=["is_active", "updated_at"])
