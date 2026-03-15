from django.db import models

from common.models import BaseModel


class Notification(BaseModel):
    recipient = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    event_type = models.CharField(max_length=100)
    actor = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+",
    )
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True, default="")
    target_type = models.CharField(max_length=50)
    target_id = models.UUIDField()
    metadata = models.JSONField(default=dict)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} → {self.recipient}"
