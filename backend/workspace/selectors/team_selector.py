from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from workspace.models import Team, TeamMembership


def list_teams(*, search=None):
    qs = Team.objects.filter(is_active=True)
    if search:
        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        qs = qs.annotate(rank=SearchRank(vector, query)).filter(rank__gt=0).order_by("-rank")
    return qs


def get_team_by_id(team_id):
    return Team.objects.filter(id=team_id, is_active=True).first()


def get_team_by_slug(team_slug):
    return Team.objects.filter(slug=team_slug, is_active=True).first()


def list_team_members(team):
    return TeamMembership.objects.filter(team=team).select_related("user")


def get_team_membership(team, user):
    return TeamMembership.objects.filter(
        team=team, user=user,
    ).select_related("user").first()
