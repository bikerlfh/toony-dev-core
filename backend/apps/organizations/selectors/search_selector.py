from django.contrib.postgres.search import (
    SearchQuery,
    SearchRank,
    SearchVector,
)

from accounts.models import OrganizationMembership
from projects.models import Issue, Project
from workspace.models import Label, Team


def global_search(user, query, *, limit=5):
    """Search across issues, projects, teams, and labels for all user's organizations."""
    sq = SearchQuery(query)

    user_org_ids = OrganizationMembership.objects.filter(
        user=user, is_active=True
    ).values_list("organization_id", flat=True)

    # Issues — search title + description across all user's org projects
    issue_qs = (
        Issue.objects.filter(project__organization_id__in=user_org_ids)
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
        Project.objects.filter(organization_id__in=user_org_ids)
        .select_related("lead")
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
        Team.objects.filter(is_active=True)
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
    label_qs = Label.objects.filter(name__icontains=query).order_by("name")[:limit]

    return {
        "issues": list(issue_qs),
        "projects": list(project_qs),
        "teams": list(team_qs),
        "labels": list(label_qs),
    }
