from django.db import models

from common.models import BaseModel


class Label(BaseModel):
    name = models.CharField(max_length=255, unique=True)
    color = models.CharField(max_length=7, default="#6b7280")
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "workspace_labels"
        ordering = ["name"]

    def __str__(self):
        return self.name
