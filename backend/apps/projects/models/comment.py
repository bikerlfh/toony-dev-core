from django.conf import settings
from django.db import models

from common.models import BaseModel


class IssueComment(BaseModel):
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="issue_comments",
    )
    body = models.TextField()
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "issue_comments"
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.author.email} on {self.issue.identifier}"
