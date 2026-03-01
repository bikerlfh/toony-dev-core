from django.db import models

from common.models import BaseModel


class MethodologyChoices(models.TextChoices):
    SCRUM = "SCRUM", "Scrum"
    KANBAN = "KANBAN", "Kanban"
    CUSTOM = "CUSTOM", "Custom"


class OrganizationSettings(BaseModel):
    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="settings",
    )
    default_project_methodology = models.CharField(
        max_length=20,
        choices=MethodologyChoices.choices,
        default=MethodologyChoices.SCRUM,
    )
    timezone = models.CharField(max_length=100, default="UTC")
    notification_preferences = models.JSONField(default=dict, blank=True)
    allowed_ip_ranges = models.JSONField(null=True, blank=True)
    audit_log_retention_days = models.IntegerField(default=90)

    class Meta:
        db_table = "organization_settings"
        verbose_name_plural = "organization settings"

    def __str__(self):
        return f"Settings for {self.organization.name}"
