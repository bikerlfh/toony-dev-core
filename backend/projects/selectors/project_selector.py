from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from projects.models import Project, ProjectMembership, ProjectSettings


def list_organization_projects(organization, *, search=None):
    qs = Project.objects.filter(
        organization=organization,
    ).select_related("team", "lead")

    if search:
        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        return qs.annotate(rank=SearchRank(vector, query)).filter(rank__gte=0.01).order_by("-rank")

    return qs.order_by("sort_order", "-created_at")


def get_project_by_slug(organization, project_slug):
    return Project.objects.filter(
        organization=organization,
        slug=project_slug,
    ).select_related("team", "lead").first()


def list_project_members(project):
    return ProjectMembership.objects.filter(
        project=project,
    ).select_related("user").order_by("-joined_at")


def get_project_membership(project, user):
    return ProjectMembership.objects.filter(
        project=project,
        user=user,
    ).select_related("user").first()


def get_project_settings(project):
    return ProjectSettings.objects.filter(project=project).first()
