from django.conf import settings
from django.db import models
from django.db.models import Q
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
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.CharField(max_length=250, blank=True, default="")
    markdown = models.TextField(blank=True, default="")
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
    is_external = models.BooleanField(default=False)
    external_command = models.TextField(blank=True, default="")
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
                condition=Q(organization__isnull=False),
                name="unique_org_agent_slug",
            ),
            models.UniqueConstraint(
                fields=["slug"],
                condition=Q(organization__isnull=True),
                name="unique_global_agent_slug",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.agent_type})"
