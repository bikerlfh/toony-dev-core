from django.db import transaction

from common.broadcast import broadcast
from projects.models import IssueDocument


def create_issue_document(*, issue, uploaded_by, file):
    with transaction.atomic():
        document = IssueDocument.objects.create(
            issue=issue,
            uploaded_by=uploaded_by,
            file=file,
            original_filename=file.name,
            file_size=file.size,
            content_type=file.content_type or "application/octet-stream",
        )

    broadcast(
        f"project_{issue.project_id}",
        "document_created",
        {"issue_id": str(issue.id), "document_id": str(document.id)},
    )

    return document


def delete_issue_document(document):
    project_id = document.issue.project_id
    issue_id = str(document.issue_id)
    document_id = str(document.id)

    document.file.delete(save=False)
    document.delete()

    broadcast(
        f"project_{project_id}",
        "document_deleted",
        {"issue_id": issue_id, "document_id": document_id},
    )
