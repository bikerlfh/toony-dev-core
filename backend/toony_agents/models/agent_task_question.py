from django.db import models

from common.models import BaseModel


class AgentTaskQuestion(BaseModel):
    """A question asked by Claude during task execution."""

    task = models.ForeignKey(
        "toony_agents.AgentTask",
        on_delete=models.CASCADE,
        related_name="questions",
    )
    question_id = models.UUIDField(unique=True)
    text = models.TextField()
    answer = models.TextField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    session_id = models.CharField(max_length=255)

    class Meta:
        db_table = "agent_task_questions"
        ordering = ["created_at"]

    def __str__(self):
        status = "answered" if self.answer else "pending"
        return f"Question {self.question_id} ({status})"
