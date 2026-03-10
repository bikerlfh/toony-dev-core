from django.db import models

from common.models import BaseModel


class ArtifactType(models.TextChoices):
    PLAN = "PLAN", "Plan"
    DESIGN_DOC = "DESIGN_DOC", "Design Doc"
    TECHNICAL_SPEC = "TECHNICAL_SPEC", "Technical Spec"
    TEST_PLAN = "TEST_PLAN", "Test Plan"
    OTHER = "OTHER", "Other"


class ArtifactStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
    IN_REVIEW = "IN_REVIEW", "In Review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    REVISION_REQUESTED = "REVISION_REQUESTED", "Revision Requested"
    SUPERSEDED = "SUPERSEDED", "Superseded"


class IssueArtifact(BaseModel):
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.CASCADE,
        related_name="artifacts",
    )
    agent_task = models.ForeignKey(
        "toony_agents.AgentTask",
        on_delete=models.CASCADE,
        related_name="artifacts",
    )
    title = models.CharField(max_length=500)
    artifact_type = models.CharField(
        max_length=20,
        choices=ArtifactType.choices,
    )
    content = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=ArtifactStatus.choices,
        default=ArtifactStatus.DRAFT,
    )
    session_id = models.CharField(max_length=255)
    requires_approval = models.BooleanField(default=False)

    class Meta:
        db_table = "issue_artifacts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.artifact_type}: {self.title}"
