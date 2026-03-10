from django.conf import settings
from django.db import models

from common.models import BaseModel


class ToonyAgentKey(BaseModel):
    toony_agent = models.ForeignKey(
        "toony_agents.ToonyAgent",
        on_delete=models.CASCADE,
        related_name="keys",
    )
    key_hash = models.CharField(max_length=128)
    key_prefix = models.CharField(max_length=12)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_toony_agent_keys",
    )

    class Meta:
        db_table = "toony_agent_keys"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.key_prefix}... ({self.name})"
