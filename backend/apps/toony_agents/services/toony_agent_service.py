import hashlib
import secrets

from django.db import transaction

from toony_agents.models import ToonyAgent, ToonyAgentKey


def create_toony_agent(registered_by, name, slug, **kwargs):
    with transaction.atomic():
        agent = ToonyAgent.objects.create(
            name=name,
            slug=slug,
            registered_by=registered_by,
            **kwargs,
        )
    return agent


def update_toony_agent(toony_agent, **kwargs):
    organization_ids = kwargs.pop("organization_ids", None)
    allowed_fields = {"name", "metadata"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(toony_agent, field, value)
    toony_agent.save()
    if organization_ids is not None:
        toony_agent.organizations.set(organization_ids)
    return toony_agent


def delete_toony_agent(toony_agent):
    toony_agent.delete()


def generate_api_key(toony_agent, created_by, name="default"):
    """Generate a new API key. Returns (ToonyAgentKey, raw_key). Raw key shown once."""
    raw_key = f"tok_ta_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:12]
    key = ToonyAgentKey.objects.create(
        toony_agent=toony_agent,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=name,
        created_by=created_by,
    )
    return key, raw_key


def revoke_api_key(key):
    key.is_active = False
    key.save()


def verify_api_key(raw_key):
    """Verify an API key and return the ToonyAgent if valid, else None."""
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    try:
        key = ToonyAgentKey.objects.select_related("toony_agent").get(
            key_hash=key_hash,
            is_active=True,
        )
    except ToonyAgentKey.DoesNotExist:
        return None
    from django.utils import timezone

    if key.expires_at and key.expires_at < timezone.now():
        return None
    key.last_used_at = timezone.now()
    key.save(update_fields=["last_used_at"])
    return key.toony_agent
