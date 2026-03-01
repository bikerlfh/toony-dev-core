from django.conf import settings
from django.db import models

from common.models import BaseModel


class SkillVersion(BaseModel):
    skill = models.ForeignKey(
        "agents.Skill",
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version = models.CharField(max_length=50)
    content = models.TextField()
    changelog = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_skill_versions",
    )

    class Meta:
        db_table = "skill_versions"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.skill.name} v{self.version}"
