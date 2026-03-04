from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from projects.models import Issue, IssueActivity, IssueComment


def get_next_identifier(project):
    """Generate the next issue identifier for a project, e.g. ENG-42."""
    # Use issue_prefix_override from settings, or project slug uppercased
    prefix = None
    try:
        settings = project.settings
        if settings.issue_prefix_override:
            prefix = settings.issue_prefix_override
    except project._meta.model.settings.RelatedObjectDoesNotExist:
        pass
    if not prefix:
        # Fallback: first associated team's identifier, or project slug
        first_team = project.project_teams.select_related("team").first()
        if first_team:
            prefix = first_team.team.identifier
        else:
            prefix = project.slug.upper()[:10]
    # Count existing issues to determine sequence number
    count = Issue.objects.filter(
        identifier__startswith=f"{prefix}-",
    ).count()
    return f"{prefix}-{count + 1}"


def list_project_issues(project, *, filters=None, search=None):
    qs = Issue.objects.filter(
        project=project,
    ).select_related(
        "assignee", "reporter", "milestone", "cycle", "parent",
    ).prefetch_related("labels")

    if search:
        vector = SearchVector("title", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        qs = qs.annotate(rank=SearchRank(vector, query)).filter(rank__gte=0.01).order_by("-rank")
        return qs

    if filters:
        if "status" in filters:
            qs = qs.filter(status=filters["status"])
        if "priority" in filters:
            qs = qs.filter(priority=filters["priority"])
        if "assignee_id" in filters:
            qs = qs.filter(assignee_id=filters["assignee_id"])
        if "milestone_id" in filters:
            qs = qs.filter(milestone_id=filters["milestone_id"])
        if "cycle_id" in filters:
            qs = qs.filter(cycle_id=filters["cycle_id"])
        if "label_ids" in filters:
            qs = qs.filter(labels__id__in=filters["label_ids"]).distinct()
        if "parent_id" in filters:
            qs = qs.filter(parent_id=filters["parent_id"])

    return qs.order_by("sort_order", "-created_at")


def get_issue_by_identifier(identifier):
    return Issue.objects.filter(
        identifier=identifier,
    ).select_related(
        "project", "assignee", "reporter", "milestone", "cycle", "parent",
    ).prefetch_related("labels").first()


def list_issue_comments(issue):
    return IssueComment.objects.filter(
        issue=issue,
    ).select_related("author").order_by("created_at")


def list_issue_activities(issue):
    return IssueActivity.objects.filter(
        issue=issue,
    ).select_related("user").order_by("-created_at")
