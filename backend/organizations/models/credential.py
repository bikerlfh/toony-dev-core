from django.db import models
from encrypted_model_fields.fields import EncryptedTextField

from common.models import BaseModel


class CredentialProvider(models.TextChoices):
    GITHUB = "GITHUB", "GitHub"
    GITLAB = "GITLAB", "GitLab"
    BITBUCKET = "BITBUCKET", "Bitbucket"
    CUSTOM = "CUSTOM", "Custom"


class CredentialType(models.TextChoices):
    TOKEN = "TOKEN", "Token"
    SSH_KEY = "SSH_KEY", "SSH Key"
    APP_CREDENTIAL = "APP_CREDENTIAL", "App Credential"


class RepositoryCredential(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="repository_credentials",
    )
    name = models.CharField(max_length=255)
    provider = models.CharField(
        max_length=20,
        choices=CredentialProvider.choices,
    )
    credential_type = models.CharField(
        max_length=20,
        choices=CredentialType.choices,
    )
    encrypted_value = EncryptedTextField()
    url_pattern = models.CharField(max_length=500, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "repository_credentials"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="unique_org_credential_name",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.provider})"
