import uuid

from django.db import models


class TaskEventType(models.TextChoices):
    LOG = "LOG", "Log"
    TOOL_USE = "TOOL_USE", "Tool Use"
    TOOL_RESULT = "TOOL_RESULT", "Tool Result"
    APPROVAL_NEEDED = "APPROVAL_NEEDED", "Approval Needed"
    APPROVAL_RESPONSE = "APPROVAL_RESPONSE", "Approval Response"
    REPLY = "REPLY", "Reply"
    STATUS_CHANGE = "STATUS_CHANGE", "Status Change"
    ERROR = "ERROR", "Error"


class TaskEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(
        "toony_agents.AgentTask",
        on_delete=models.CASCADE,
        related_name="events",
    )
    event_type = models.CharField(
        max_length=20,
        choices=TaskEventType.choices,
    )
    data = models.JSONField(default=dict)
    sequence = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "task_events"
        ordering = ["sequence"]
        indexes = [
            models.Index(fields=["task", "sequence"]),
        ]

    def __str__(self):
        return f"Event #{self.sequence} ({self.event_type})"
