from projects.models import ProjectResource


def list_project_resources(project):
    return ProjectResource.objects.filter(
        project=project,
    ).order_by("-created_at")


def get_resource_by_id(project, resource_id):
    return ProjectResource.objects.filter(
        project=project,
        id=resource_id,
    ).first()
