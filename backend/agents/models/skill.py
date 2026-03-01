from django.conf import settings
from django.db import models

from common.models import BaseModel


class SkillStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"
    DEPRECATED = "DEPRECATED", "Deprecated"


class SkillCategory(models.TextChoices):
    CODING = "CODING", "Coding"
    TESTING = "TESTING", "Testing"
    REVIEW = "REVIEW", "Review"
    DOCUMENTATION = "DOCUMENTATION", "Documentation"
    DEPLOYMENT = "DEPLOYMENT", "Deployment"
    CUSTOM = "CUSTOM", "Custom"


class Skill(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="skills",
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True, default="")
    version = models.CharField(max_length=50, default="0.1.0")
    status = models.CharField(
        max_length=20,
        choices=SkillStatus.choices,
        default=SkillStatus.DRAFT,
    )
    content = models.TextField(blank=True, default="")
    category = models.CharField(
        max_length=20,
        choices=SkillCategory.choices,
        default=SkillCategory.CUSTOM,
    )
    input_schema = models.JSONField(null=True, blank=True)
    output_schema = models.JSONField(null=True, blank=True)
    compatible_agent_types = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_skills",
    )
    tags = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "skills"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                name="unique_org_skill_slug",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.category})"
