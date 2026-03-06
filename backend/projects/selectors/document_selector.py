from projects.models import IssueDocument


def list_issue_documents(issue):
    return (
        IssueDocument.objects
        .filter(issue=issue)
        .select_related("uploaded_by")
        .order_by("-created_at")
    )


def get_document_by_id(document_id):
    return (
        IssueDocument.objects
        .select_related("uploaded_by")
        .filter(id=document_id)
        .first()
    )
