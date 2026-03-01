from projects.models import Project, ProjectMembership, ProjectSettings


def list_organization_projects(organization):
    return Project.objects.filter(
        organization=organization,
    ).select_related("team", "lead").order_by("sort_order", "-created_at")


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
