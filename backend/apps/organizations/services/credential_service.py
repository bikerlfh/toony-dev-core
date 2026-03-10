from common.exceptions import ConflictError
from organizations.models import RepositoryCredential


def create_credential(organization, name, provider, credential_type, encrypted_value, url_pattern=""):
    if RepositoryCredential.objects.filter(organization=organization, name=name).exists():
        raise ConflictError("A credential with this name already exists in this organization.")

    return RepositoryCredential.objects.create(
        organization=organization,
        name=name,
        provider=provider,
        credential_type=credential_type,
        encrypted_value=encrypted_value,
        url_pattern=url_pattern,
    )


def update_credential(credential, **kwargs):
    allowed_fields = {"name", "provider", "credential_type", "encrypted_value", "url_pattern", "is_active"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(credential, field, value)
    credential.save()
    return credential


def delete_credential(credential):
    credential.delete()
