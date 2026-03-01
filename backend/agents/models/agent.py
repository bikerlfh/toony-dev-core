from django.conf import settings
from django.db import models
from encrypted_model_fields.fields import EncryptedTextField

from common.models import BaseModel


class AgentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"
    DEPRECATED = "DEPRECATED", "Deprecated"


class AgentType(models.TextChoices):
    CODER = "CODER", "Coder"
    REVIEWER = "REVIEWER", "Reviewer"
    TESTER = "TESTER", "Tester"
    PLANNER = "PLANNER", "Planner"
    CUSTOM = "CUSTOM", "Custom"


class Agent(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="agents",
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True, default="")
    version = models.CharField(max_length=50, default="0.1.0")
    status = models.CharField(
        max_length=20,
        choices=AgentStatus.choices,
        default=AgentStatus.DRAFT,
    )
    agent_type = models.CharField(
        max_length=20,
        choices=AgentType.choices,
        default=AgentType.CUSTOM,
    )
    capabilities = models.JSONField(default=list, blank=True)
    encrypted_configuration = EncryptedTextField(blank=True, default="")
    max_concurrent_tasks = models.IntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_agents",
    )
    tags = models.JSONField(default=list, blank=True)
    assigned_projects = models.ManyToManyField(
        "projects.Project",
        blank=True,
        related_name="assigned_agents",
    )

    class Meta:
        db_table = "agents"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                name="unique_org_agent_slug",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.agent_type})"
