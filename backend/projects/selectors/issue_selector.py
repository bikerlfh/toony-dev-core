from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.models import Prefetch

from projects.models import Issue, IssueActivity, IssueArtifact, IssueComment, IssueDocument


def get_next_identifier(project):
    """Generate the next issue identifier for a project, e.g. ENG-42."""
    prefix = project.settings.issue_prefix
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


def get_issue_by_id(issue_id):
    """Look up an issue by UUID with select_related and prefetch_related."""
    return Issue.objects.filter(
        id=issue_id,
    ).select_related(
        "assignee", "reporter", "milestone", "cycle", "parent",
    ).prefetch_related("labels").first()


def list_issue_comments(issue):
    return IssueComment.objects.filter(
        issue=issue,
    ).select_related("author").order_by("created_at")


def list_issue_activities(issue):
    return IssueActivity.objects.filter(
        issue=issue,
    ).select_related("user").order_by("-created_at")


def list_user_issues(user, *, filters=None, search=None):
    """List issues across all projects the user is a member of."""
    qs = Issue.objects.filter(
        project__memberships__user=user,
    ).select_related(
        "assignee", "project",
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
        if "project_id" in filters:
            qs = qs.filter(project_id=filters["project_id"])

    return qs.order_by("sort_order", "-created_at")


def get_issue_full_detail(issue_id_or_identifier):
    """Fetch a single issue with all related data prefetched."""
    try:
        import uuid
        uuid.UUID(issue_id_or_identifier)
        lookup = {"id": issue_id_or_identifier}
    except ValueError:
        lookup = {"identifier__iexact": issue_id_or_identifier}

    return Issue.objects.select_related(
        "project", "assignee", "reporter", "milestone", "cycle", "parent",
    ).prefetch_related(
        "labels",
        Prefetch("comments", queryset=IssueComment.objects.select_related("author").order_by("created_at")),
        Prefetch("activities", queryset=IssueActivity.objects.select_related("user").order_by("-created_at")),
        Prefetch("artifacts", queryset=IssueArtifact.objects.select_related("agent_task").order_by("-created_at")),
        Prefetch("documents", queryset=IssueDocument.objects.select_related("uploaded_by").order_by("-created_at")),
    ).get(**lookup)
