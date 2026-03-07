from django.db import models

from common.models import BaseModel


class WorkflowEdge(BaseModel):
    workflow = models.ForeignKey(
        "workflows.Workflow",
        on_delete=models.CASCADE,
        related_name="edges",
    )
    source_node = models.ForeignKey(
        "workflows.WorkflowNode",
        on_delete=models.CASCADE,
        related_name="outgoing_edges",
    )
    target_node = models.ForeignKey(
        "workflows.WorkflowNode",
        on_delete=models.CASCADE,
        related_name="incoming_edges",
    )

    class Meta:
        db_table = "workflow_edges"
        constraints = [
            models.UniqueConstraint(
                fields=["source_node", "target_node"],
                name="unique_workflow_edge",
            ),
        ]

    def __str__(self):
        return f"{self.source_node} -> {self.target_node}"
