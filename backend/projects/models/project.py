from django.conf import settings
from django.db import models

from common.models import BaseModel


class ProjectStatus(models.TextChoices):
    BACKLOG = "BACKLOG", "Backlog"
    PLANNED = "PLANNED", "Planned"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    PAUSED = "PAUSED", "Paused"
    COMPLETED = "COMPLETED", "Completed"
    CANCELED = "CANCELED", "Canceled"


class ProjectPriority(models.TextChoices):
    NONE = "NONE", "None"
    URGENT = "URGENT", "Urgent"
    HIGH = "HIGH", "High"
    MEDIUM = "MEDIUM", "Medium"
    LOW = "LOW", "Low"


class ProjectMemberRole(models.TextChoices):
    LEAD = "LEAD", "Lead"
    CONTRIBUTOR = "CONTRIBUTOR", "Contributor"
    REVIEWER = "REVIEWER", "Reviewer"


class EstimationMethod(models.TextChoices):
    STORY_POINTS = "STORY_POINTS", "Story Points"
    T_SHIRT = "T_SHIRT", "T-Shirt"
    HOURS = "HOURS", "Hours"


class Project(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="projects",
    )
    team = models.ForeignKey(
        "projects.Team",
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True, default="")
    short_summary = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=ProjectStatus.choices,
        default=ProjectStatus.BACKLOG,
    )
    priority = models.CharField(
        max_length=20,
        choices=ProjectPriority.choices,
        default=ProjectPriority.NONE,
    )
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_projects",
    )
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    sort_order = models.IntegerField(default=0)
    icon = models.CharField(max_length=50, blank=True, default="")
    color = models.CharField(max_length=7, blank=True, default="")

    class Meta:
        db_table = "projects"
        ordering = ["sort_order", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                name="unique_org_project_slug",
            ),
        ]

    def __str__(self):
        return self.name


class ProjectMembership(BaseModel):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=ProjectMemberRole.choices,
        default=ProjectMemberRole.CONTRIBUTOR,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_memberships"
        ordering = ["-joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "user"],
                name="unique_project_user",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.project.name} ({self.role})"


class ProjectSettings(BaseModel):
    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="settings",
    )
    repository_url = models.URLField(blank=True, default="")
    repository_credential = models.ForeignKey(
        "organizations.RepositoryCredential",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="project_settings",
    )
    default_branch = models.CharField(max_length=255, default="main")
    branch_naming_convention = models.CharField(
        max_length=255, blank=True, default=""
    )
    required_reviewers_count = models.IntegerField(default=1)
    auto_close_completed_issues = models.BooleanField(default=False)
    issue_prefix_override = models.CharField(
        max_length=10, blank=True, default=""
    )
    estimation_method = models.CharField(
        max_length=20,
        choices=EstimationMethod.choices,
        default=EstimationMethod.STORY_POINTS,
    )

    class Meta:
        db_table = "project_settings"
        verbose_name_plural = "project settings"

    def __str__(self):
        return f"Settings for {self.project.name}"
