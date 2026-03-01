from django.conf import settings
from django.db import models

import uuid


class IssueActivity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.CASCADE,
        related_name="activities",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="issue_activities",
    )
    action = models.CharField(max_length=50)
    field_changed = models.CharField(max_length=100, blank=True, default="")
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "issue_activities"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} on {self.issue.identifier} by {self.user.email}"
