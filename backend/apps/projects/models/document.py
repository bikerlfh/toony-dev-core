from django.db import models

from common.models import BaseModel


class IssueDocument(BaseModel):
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.CASCADE,
        related_name="documents",
    )
    uploaded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    file = models.FileField(upload_to="issue_documents/%Y/%m/")
    original_filename = models.CharField(max_length=500)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)

    class Meta:
        db_table = "issue_documents"
        ordering = ["-created_at"]

    def __str__(self):
        return self.original_filename
