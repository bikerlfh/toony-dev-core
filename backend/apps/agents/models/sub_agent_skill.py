from django.db import models

from common.models import BaseModel


class SubAgentSkill(BaseModel):
    sub_agent = models.ForeignKey(
        "agents.SubAgent",
        on_delete=models.CASCADE,
        related_name="sub_agent_skills",
    )
    skill = models.ForeignKey(
        "agents.Skill",
        on_delete=models.CASCADE,
        related_name="sub_agent_skills",
    )
    priority = models.IntegerField(default=0)
    is_enabled = models.BooleanField(default=True)
    custom_config = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "sub_agent_skills"
        ordering = ["priority", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["sub_agent", "skill"],
                name="unique_sub_agent_skill",
            ),
        ]

    def __str__(self):
        return f"{self.sub_agent.name} - {self.skill.name}"
