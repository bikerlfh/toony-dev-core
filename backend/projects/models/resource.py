from django.db import models

from common.models import BaseModel


class ResourceType(models.TextChoices):
    DOCUMENTATION = "DOCUMENTATION", "Documentation"
    WEBPAGE = "WEBPAGE", "Webpage"


class ProjectResource(BaseModel):
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="resources",
    )
    title = models.CharField(max_length=255)
    url = models.URLField()
    type = models.CharField(
        max_length=20,
        choices=ResourceType.choices,
    )

    class Meta:
        db_table = "project_resources"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
