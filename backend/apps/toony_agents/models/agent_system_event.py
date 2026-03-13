import uuid

from django.db import models


class AgentSystemEventType(models.TextChoices):
    REPO_CLONE_SUCCESS = "REPO_CLONE_SUCCESS", "Repo Clone Success"
    REPO_CLONE_ERROR = "REPO_CLONE_ERROR", "Repo Clone Error"
    CONFIG_SYNC_COMPLETED = "CONFIG_SYNC_COMPLETED", "Config Sync Completed"
    CONFIG_SYNC_FAILED = "CONFIG_SYNC_FAILED", "Config Sync Failed"


class AgentSystemEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    toony_agent = models.ForeignKey(
        "toony_agents.ToonyAgent",
        on_delete=models.CASCADE,
        related_name="system_events",
    )
    event_type = models.CharField(
        max_length=50,
        choices=AgentSystemEventType.choices,
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "agent_system_events"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["toony_agent", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} ({self.created_at})"
