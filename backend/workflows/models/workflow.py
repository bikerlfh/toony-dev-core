from django.conf import settings
from django.db import models

from common.models import BaseModel


class Workflow(BaseModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflows",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflows",
    )
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflows",
    )
    label = models.ForeignKey(
        "workspace.Label",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflows",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_workflows",
    )

    class Meta:
        db_table = "workflows"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                condition=models.Q(organization__isnull=False),
                name="unique_org_workflow_slug",
            ),
            models.UniqueConstraint(
                fields=["project", "slug"],
                condition=models.Q(project__isnull=False),
                name="unique_project_workflow_slug",
            ),
            models.UniqueConstraint(
                fields=["slug"],
                condition=models.Q(
                    organization__isnull=True,
                    project__isnull=True,
                    issue__isnull=True,
                ),
                name="unique_global_workflow_slug",
            ),
        ]

    def __str__(self):
        return self.name
