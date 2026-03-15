from django.db import transaction
from rest_framework.exceptions import ValidationError as DRFValidationError

from common.broadcast import broadcast
from projects.models import IssueArtifact
from projects.models.artifact import ArtifactStatus

VALID_TRANSITIONS = {
    ArtifactStatus.DRAFT: {ArtifactStatus.PENDING_APPROVAL},
    ArtifactStatus.PENDING_APPROVAL: {
        ArtifactStatus.IN_REVIEW,
        ArtifactStatus.APPROVED,
        ArtifactStatus.REJECTED,
    },
    ArtifactStatus.IN_REVIEW: {
        ArtifactStatus.APPROVED,
        ArtifactStatus.REJECTED,
        ArtifactStatus.REVISION_REQUESTED,
    },
    ArtifactStatus.REVISION_REQUESTED: {
        ArtifactStatus.PENDING_APPROVAL,
        ArtifactStatus.DRAFT,
    },
    ArtifactStatus.APPROVED: {ArtifactStatus.SUPERSEDED},
    ArtifactStatus.REJECTED: {ArtifactStatus.DRAFT},
    ArtifactStatus.SUPERSEDED: set(),
}


def create_artifact(
    issue,
    agent_task,
    title,
    artifact_type,
    content,
    session_id="",
    requires_approval=False,
):
    initial_status = ArtifactStatus.PENDING_APPROVAL if requires_approval else ArtifactStatus.DRAFT

    with transaction.atomic():
        IssueArtifact.objects.filter(
            issue=issue,
            artifact_type=artifact_type,
            status=ArtifactStatus.APPROVED,
        ).update(status=ArtifactStatus.SUPERSEDED)

        artifact = IssueArtifact.objects.create(
            issue=issue,
            agent_task=agent_task,
            title=title,
            artifact_type=artifact_type,
            content=content,
            status=initial_status,
            session_id=session_id,
            requires_approval=requires_approval,
        )

    broadcast(
        f"project_{issue.project_id}",
        "artifact_created",
        {"issue_id": str(issue.id), "artifact_id": str(artifact.id)},
    )

    # --- Notifications ---
    from notifications.services import notify
    notify("artifact.created", {"artifact": artifact, "issue": issue, "actor": None})

    return artifact


def update_artifact(artifact, **kwargs):
    new_status = kwargs.pop("status", None)

    if new_status and new_status != artifact.status:
        allowed = VALID_TRANSITIONS.get(artifact.status, set())
        if new_status not in allowed:
            raise DRFValidationError(f"Cannot transition from {artifact.status} to {new_status}.")
        artifact.status = new_status

    for field in ("title", "content", "requires_approval"):
        if field in kwargs:
            setattr(artifact, field, kwargs[field])

    artifact.save()

    broadcast(
        f"project_{artifact.issue.project_id}",
        "artifact_updated",
        {"issue_id": str(artifact.issue_id), "artifact_id": str(artifact.id)},
    )

    return artifact


def delete_artifact(artifact):
    project_id = artifact.issue.project_id
    issue_id = str(artifact.issue_id)
    artifact_id = str(artifact.id)
    artifact.delete()

    broadcast(
        f"project_{project_id}",
        "artifact_deleted",
        {"issue_id": issue_id, "artifact_id": artifact_id},
    )
