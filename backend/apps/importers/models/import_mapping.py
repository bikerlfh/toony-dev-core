import uuid

from django.db import models

from common.models import BaseModel


class ImportMapping(BaseModel):
    import_job = models.ForeignKey(
        "importers.ImportJob",
        on_delete=models.CASCADE,
        related_name="mappings",
    )
    external_id = models.CharField(max_length=255)
    external_type = models.CharField(max_length=100)
    internal_id = models.UUIDField(default=uuid.uuid4)
    internal_type = models.CharField(max_length=100)

    class Meta:
        db_table = "import_mappings"
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["import_job", "external_id", "external_type"],
                name="unique_import_mapping",
            ),
        ]

    def __str__(self):
        return f"{self.external_type}:{self.external_id} → {self.internal_type}:{self.internal_id}"
