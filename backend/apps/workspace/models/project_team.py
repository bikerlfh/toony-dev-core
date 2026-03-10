from django.db import models

from common.models import BaseModel


class ProjectTeam(BaseModel):
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="project_teams",
    )
    team = models.ForeignKey(
        "workspace.Team",
        on_delete=models.CASCADE,
        related_name="team_projects",
    )

    class Meta:
        db_table = "workspace_project_teams"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "team"],
                name="unique_project_team",
            ),
        ]

    def __str__(self):
        return f"{self.project.name} - {self.team.name}"
