from django.db import models
from encrypted_model_fields.fields import EncryptedTextField

from common.models import BaseModel


class IntegrationProvider(models.TextChoices):
    LINEAR = "LINEAR", "Linear"
    JIRA = "JIRA", "Jira"
    TRELLO = "TRELLO", "Trello"
    SLACK = "SLACK", "Slack"
    CUSTOM = "CUSTOM", "Custom"


class IntegrationConfig(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="integration_configs",
    )
    provider = models.CharField(
        max_length=20,
        choices=IntegrationProvider.choices,
    )
    encrypted_credentials = EncryptedTextField()
    webhook_url = models.URLField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "integration_configs"
        ordering = ["provider"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "provider"],
                name="unique_org_integration_provider",
            ),
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.provider}"
