from django.conf import settings
from django.db import models

from common.models import BaseModel


class ImportJobStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED", "Partially Completed"


class ImportProvider(models.TextChoices):
    LINEAR = "LINEAR", "Linear"
    JIRA = "JIRA", "Jira"
    TRELLO = "TRELLO", "Trello"
    ASANA = "ASANA", "Asana"
    GITHUB_PROJECTS = "GITHUB_PROJECTS", "GitHub Projects"


class ImportJob(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="import_jobs",
    )
    target_project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="import_jobs",
    )
    provider = models.CharField(
        max_length=30,
        choices=ImportProvider.choices,
    )
    status = models.CharField(
        max_length=30,
        choices=ImportJobStatus.choices,
        default=ImportJobStatus.PENDING,
    )
    config = models.JSONField(default=dict, blank=True)
    progress = models.IntegerField(default=0)
    total_items = models.IntegerField(default=0)
    imported_items = models.IntegerField(default=0)
    error_log = models.JSONField(default=list, blank=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="import_jobs",
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "import_jobs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Import {self.provider} - {self.status} ({self.progress}%)"
