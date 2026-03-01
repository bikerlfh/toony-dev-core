from django.db import models

from common.models import BaseModel


class Label(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="labels",
    )
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=7, default="#6b7280")
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "labels"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="unique_org_label_name",
            ),
        ]

    def __str__(self):
        return self.name
