from django.conf import settings
from django.db import models

from common.models import BaseModel


class ToonyAgentStatus(models.TextChoices):
    OFFLINE = "OFFLINE", "Offline"
    ONLINE = "ONLINE", "Online"
    BUSY = "BUSY", "Busy"


class ToonyAgent(BaseModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=100, unique=True)
    organizations = models.ManyToManyField(
        "organizations.Organization",
        related_name="toony_agents",
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=ToonyAgentStatus.choices,
        default=ToonyAgentStatus.OFFLINE,
    )
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    last_connected_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="registered_toony_agents",
    )

    class Meta:
        db_table = "toony_agents"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"
