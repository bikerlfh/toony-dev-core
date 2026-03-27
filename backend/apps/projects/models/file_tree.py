from django.db import models

from common.models import BaseModel


class ProjectFileTree(BaseModel):
    project = models.OneToOneField(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="file_tree",
    )
    tree = models.JSONField(default=list)
    branch = models.CharField(max_length=255, blank=True, default="")
    synced_at = models.DateTimeField()

    class Meta:
        db_table = "project_file_trees"

    def __str__(self):
        return f"FileTree({self.project_id}, {len(self.tree)} files)"
