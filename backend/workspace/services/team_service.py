from django.db import transaction

from common.exceptions import ConflictError
from workspace.models import Team, TeamMembership, TeamRole


def create_team(name, slug, identifier, creator, **kwargs):
    if Team.objects.filter(slug=slug).exists():
        raise ConflictError("A team with this slug already exists.")
    if Team.objects.filter(identifier=identifier).exists():
        raise ConflictError("A team with this identifier already exists.")

    with transaction.atomic():
        team = Team.objects.create(
            name=name,
            slug=slug,
            identifier=identifier,
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


def add_team_member(team, user, role=TeamRole.MEMBER):
    existing = TeamMembership.objects.filter(team=team, user=user).first()
    if existing:
        raise ConflictError("User is already a member of this team.")
    return TeamMembership.objects.create(team=team, user=user, role=role)


def update_team_member_role(membership, new_role):
    if membership.role == TeamRole.LEAD and new_role != TeamRole.LEAD:
        lead_count = TeamMembership.objects.filter(
            team=membership.team, role=TeamRole.LEAD,
        ).count()
        if lead_count <= 1:
            raise ConflictError("Cannot remove the last team lead.")
    membership.role = new_role
    membership.save()
    return membership


def remove_team_member(membership):
    if membership.role == TeamRole.LEAD:
        lead_count = TeamMembership.objects.filter(
            team=membership.team, role=TeamRole.LEAD,
        ).count()
        if lead_count <= 1:
            raise ConflictError("Cannot remove the last team lead.")
    membership.delete()
