import json

from common.exceptions import ConflictError
from organizations.models import IntegrationConfig


def create_integration(organization, provider, encrypted_credentials, webhook_url=""):
    if IntegrationConfig.objects.filter(organization=organization, provider=provider).exists():
        raise ConflictError("An integration with this provider already exists in this organization.")

    if not isinstance(encrypted_credentials, str):
        encrypted_credentials = json.dumps(encrypted_credentials)

    return IntegrationConfig.objects.create(
        organization=organization,
        provider=provider,
        encrypted_credentials=encrypted_credentials,
        webhook_url=webhook_url,
    )


def update_integration(integration, **kwargs):
    allowed_fields = {"provider", "encrypted_credentials", "webhook_url", "is_active"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            if field == "encrypted_credentials" and not isinstance(value, str):
                value = json.dumps(value)
            setattr(integration, field, value)
    integration.save()
    return integration


def delete_integration(integration):
    integration.delete()
