from django.db import models

from common.models import BaseModel


class MilestoneStatus(models.TextChoices):
    PLANNED = "PLANNED", "Planned"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"


class Milestone(BaseModel):
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="milestones",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=MilestoneStatus.choices,
        default=MilestoneStatus.PLANNED,
    )
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "milestones"
        ordering = ["sort_order", "-created_at"]

    def __str__(self):
        return self.name
