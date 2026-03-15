from django.conf import settings
from django.db import models

from common.models import BaseModel


class AgentTaskStatus(models.TextChoices):
    QUEUED = "QUEUED", "Queued"
    PAUSED = "PAUSED", "Paused"
    ASSIGNED = "ASSIGNED", "Assigned"
    RUNNING = "RUNNING", "Running"
    WAITING_FOR_ANSWER = "WAITING_FOR_ANSWER", "Waiting for Answer"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"


class AgentTask(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="agent_tasks",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agent_tasks",
    )
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agent_tasks",
    )
    toony_agent = models.ForeignKey(
        "toony_agents.ToonyAgent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    title = models.CharField(max_length=500)
    prompt = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=AgentTaskStatus.choices,
        default=AgentTaskStatus.QUEUED,
    )
    result = models.TextField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    session_id = models.CharField(max_length=255, null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_agent_tasks",
    )

    class Meta:
        db_table = "agent_tasks"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["toony_agent", "status"]),
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.status})"
