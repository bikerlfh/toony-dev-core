from django.db import models

from common.models import BaseModel


class WorkflowNodeType(models.TextChoices):
    SUBAGENT = "SUBAGENT", "SubAgent"
    SKILL = "SKILL", "Skill"


class WorkflowNode(BaseModel):
    workflow = models.ForeignKey(
        "workflows.Workflow",
        on_delete=models.CASCADE,
        related_name="nodes",
    )
    node_type = models.CharField(
        max_length=20,
        choices=WorkflowNodeType.choices,
    )
    sub_agent = models.ForeignKey(
        "agents.SubAgent",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_nodes",
    )
    skill = models.ForeignKey(
        "agents.Skill",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_nodes",
    )
    position_x = models.FloatField(default=0)
    position_y = models.FloatField(default=0)
    config_overrides = models.JSONField(default=dict)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "workflow_nodes"
        ordering = ["order", "created_at"]

    def __str__(self):
        ref = self.sub_agent or self.skill
        return f"{self.node_type}: {ref}"
