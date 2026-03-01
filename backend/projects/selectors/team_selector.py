from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from projects.models import Team, TeamMembership


def list_organization_teams(organization, *, search=None):
    qs = Team.objects.filter(
        organization=organization,
        is_active=True,
    )

    if search:
        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        return qs.annotate(rank=SearchRank(vector, query)).filter(rank__gte=0.01).order_by("-rank")

    return qs.order_by("name")


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
