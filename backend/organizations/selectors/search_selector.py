from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from projects.models import Issue, Label, Project, Team


def global_search(organization, query, *, limit=5):
    """Search across issues, projects, teams, and labels within an organization."""
    sq = SearchQuery(query)

    # Issues — search title + description across all org projects
    issue_qs = (
        Issue.objects.filter(project__organization=organization)
        .select_related("project", "assignee")
        .prefetch_related("labels")
        .annotate(
            rank=SearchRank(
                SearchVector("title", weight="A") + SearchVector("description", weight="B"),
                sq,
            )
        )
        .filter(rank__gte=0.01)
        .order_by("-rank")[:limit]
    )

    # Projects
    project_qs = (
        Project.objects.filter(organization=organization)
        .select_related("team", "lead")
        .annotate(
            rank=SearchRank(
                SearchVector("name", weight="A") + SearchVector("description", weight="B"),
                sq,
            )
        )
        .filter(rank__gte=0.01)
        .order_by("-rank")[:limit]
    )

    # Teams
    team_qs = (
        Team.objects.filter(organization=organization, is_active=True)
        .annotate(
            rank=SearchRank(
                SearchVector("name", weight="A") + SearchVector("description", weight="B"),
                sq,
            )
        )
        .filter(rank__gte=0.01)
        .order_by("-rank")[:limit]
    )

    # Labels — simple icontains since names are short
    label_qs = (
        Label.objects.filter(organization=organization, name__icontains=query)
        .order_by("name")[:limit]
    )

    return {
        "issues": list(issue_qs),
        "projects": list(project_qs),
        "teams": list(team_qs),
        "labels": list(label_qs),
    }
