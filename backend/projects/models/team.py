from django.conf import settings
from django.db import models

from common.models import BaseModel


class TeamRole(models.TextChoices):
    LEAD = "LEAD", "Lead"
    MEMBER = "MEMBER", "Member"


class Team(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="teams",
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True, default="")
    identifier = models.CharField(max_length=10)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "teams"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                name="unique_org_team_slug",
            ),
            models.UniqueConstraint(
                fields=["organization", "identifier"],
                name="unique_org_team_identifier",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "name"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.identifier})"


class TeamMembership(BaseModel):
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=TeamRole.choices,
        default=TeamRole.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "team_memberships"
        ordering = ["-joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "user"],
                name="unique_team_user",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.team.name} ({self.role})"
