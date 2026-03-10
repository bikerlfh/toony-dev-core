from django.db import models

from common.models import BaseModel


class CycleStatus(models.TextChoices):
    PLANNED = "PLANNED", "Planned"
    ACTIVE = "ACTIVE", "Active"
    COMPLETED = "COMPLETED", "Completed"


class Cycle(BaseModel):
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="cycles",
    )
    name = models.CharField(max_length=255)
    number = models.IntegerField()
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=CycleStatus.choices,
        default=CycleStatus.PLANNED,
    )

    class Meta:
        db_table = "cycles"
        ordering = ["-number"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "number"],
                name="unique_project_cycle_number",
            ),
        ]

    def __str__(self):
        return f"{self.name} (#{self.number})"
