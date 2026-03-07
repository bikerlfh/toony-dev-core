from django.db import models

from common.models import BaseModel


class UserAPIKey(BaseModel):
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="api_keys",
    )
    key_hash = models.CharField(max_length=128, unique=True)
    key_prefix = models.CharField(max_length=8)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_api_keys"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.key_prefix}...)"
