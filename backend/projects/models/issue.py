from django.conf import settings
from django.db import models

from common.models import BaseModel


class IssueStatus(models.TextChoices):
    BACKLOG = "BACKLOG", "Backlog"
    TODO = "TODO", "Todo"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    IN_REVIEW = "IN_REVIEW", "In Review"
    DONE = "DONE", "Done"
    CANCELED = "CANCELED", "Canceled"


class IssuePriority(models.TextChoices):
    NONE = "NONE", "None"
    URGENT = "URGENT", "Urgent"
    HIGH = "HIGH", "High"
    MEDIUM = "MEDIUM", "Medium"
    LOW = "LOW", "Low"


class Issue(BaseModel):
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="issues",
    )
    milestone = models.ForeignKey(
        "projects.Milestone",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
    )
    cycle = models.ForeignKey(
        "projects.Cycle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sub_issues",
    )
    identifier = models.CharField(max_length=30, unique=True)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=IssueStatus.choices,
        default=IssueStatus.BACKLOG,
    )
    priority = models.CharField(
        max_length=20,
        choices=IssuePriority.choices,
        default=IssuePriority.NONE,
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_issues",
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reported_issues",
    )
    labels = models.ManyToManyField(
        "projects.Label",
        blank=True,
        related_name="issues",
    )
    estimate = models.IntegerField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    sort_order = models.IntegerField(default=0)
    external_tracker_name = models.CharField(max_length=100, blank=True, default="")
    external_tracker_url = models.URLField(blank=True, default="")
    external_tracker_id = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "issues"
        ordering = ["sort_order", "-created_at"]
        indexes = [
            models.Index(fields=["project", "status"]),
            models.Index(fields=["project", "created_at"]),
            models.Index(fields=["project", "sort_order", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.identifier}: {self.title}"
