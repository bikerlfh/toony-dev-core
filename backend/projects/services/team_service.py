from django.db import transaction
from rest_framework.exceptions import ValidationError

from common.exceptions import ConflictError
from projects.models import Team, TeamMembership, TeamRole
from projects.selectors import get_team_by_slug, get_team_membership


def create_team(organization, name, slug, identifier, creator, **kwargs):
    if get_team_by_slug(organization, slug):
        raise ConflictError("A team with this slug already exists in the organization.")

    existing_identifier = Team.objects.filter(
        organization=organization, identifier=identifier,
    ).exists()
    if existing_identifier:
        raise ConflictError(
            "A team with this identifier already exists in the organization."
        )

    with transaction.atomic():
        team = Team.objects.create(
            organization=organization,
            name=name,
            slug=slug,
            identifier=identifier.upper(),
            **kwargs,
        )
        TeamMembership.objects.create(
            team=team,
            user=creator,
            role=TeamRole.LEAD,
        )

    return team


def update_team(team, **kwargs):
    allowed_fields = {"name", "description"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(team, field, value)
    team.save()
    return team


def delete_team(team):
    team.is_active = False
    team.save()
    return team


def add_team_member(team, user, role=TeamRole.MEMBER):
    existing = get_team_membership(team, user)
    if existing:
        raise ConflictError("User is already a member of this team.")
    return TeamMembership.objects.create(team=team, user=user, role=role)


def update_team_member_role(membership, new_role):
    if membership.role == TeamRole.LEAD and new_role != TeamRole.LEAD:
        lead_count = TeamMembership.objects.filter(
            team=membership.team, role=TeamRole.LEAD,
        ).count()
        if lead_count <= 1:
            raise ValidationError(
                "Cannot change role of the last lead. Assign another lead first."
            )
    membership.role = new_role
    membership.save()
    return membership


def remove_team_member(membership):
    if membership.role == TeamRole.LEAD:
        lead_count = TeamMembership.objects.filter(
            team=membership.team, role=TeamRole.LEAD,
        ).count()
        if lead_count <= 1:
            raise ValidationError(
                "Cannot remove the last lead. Assign another lead first."
            )
    membership.delete()
