from django.db import models

from common.models import BaseModel


class AgentSkill(BaseModel):
    agent = models.ForeignKey(
        "agents.Agent",
        on_delete=models.CASCADE,
        related_name="agent_skills",
    )
    skill = models.ForeignKey(
        "agents.Skill",
        on_delete=models.CASCADE,
        related_name="agent_skills",
    )
    priority = models.IntegerField(default=0)
    is_enabled = models.BooleanField(default=True)
    custom_config = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "agent_skills"
        ordering = ["priority", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["agent", "skill"],
                name="unique_agent_skill",
            ),
        ]

    def __str__(self):
        return f"{self.agent.name} - {self.skill.name}"
