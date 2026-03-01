from projects.models import Team, TeamMembership


def list_organization_teams(organization):
    return Team.objects.filter(
        organization=organization,
        is_active=True,
    ).order_by("name")


def get_team_by_slug(organization, team_slug):
    return Team.objects.filter(
        organization=organization,
        slug=team_slug,
        is_active=True,
    ).first()


def list_team_members(team):
    return TeamMembership.objects.filter(
        team=team,
    ).select_related("user").order_by("-joined_at")


def get_team_membership(team, user):
    return TeamMembership.objects.filter(
        team=team,
        user=user,
    ).select_related("user").first()
