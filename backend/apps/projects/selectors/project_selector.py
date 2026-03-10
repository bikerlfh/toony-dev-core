from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from accounts.models import OrganizationMembership
from projects.models import Project, ProjectMembership, ProjectSettings


def list_organization_projects(organization, *, search=None):
    qs = Project.objects.filter(
        organization=organization,
    ).select_related("lead")

    if search:
        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        return qs.annotate(rank=SearchRank(vector, query)).filter(rank__gte=0.01).order_by("-rank")

    return qs.order_by("sort_order", "-created_at")


def get_project_by_slug(organization, project_slug):
    return (
        Project.objects.filter(
            organization=organization,
            slug=project_slug,
        )
        .select_related("lead")
        .first()
    )


def get_project_by_id(project_id):
    """Look up a project by UUID with select_related."""
    return (
        Project.objects.filter(
            id=project_id,
        )
        .select_related("lead", "organization")
        .first()
    )


def list_user_projects(user, *, search=None):
    """List all projects across all orgs where user has membership."""
    org_ids = OrganizationMembership.objects.filter(
        user=user,
        is_active=True,
        organization__is_active=True,
    ).values_list("organization_id", flat=True)

    qs = Project.objects.filter(
        organization_id__in=org_ids,
    ).select_related("lead", "organization")

    if search:
        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        return qs.annotate(rank=SearchRank(vector, query)).filter(rank__gte=0.01).order_by("-rank")

    return qs.order_by("sort_order", "-created_at")


def list_project_members(project):
    return (
        ProjectMembership.objects.filter(
            project=project,
        )
        .select_related("user")
        .order_by("-joined_at")
    )


def get_project_membership(project, user):
    return (
        ProjectMembership.objects.filter(
            project=project,
            user=user,
        )
        .select_related("user")
        .first()
    )


def get_project_settings(project):
    return ProjectSettings.objects.filter(project=project).first()
