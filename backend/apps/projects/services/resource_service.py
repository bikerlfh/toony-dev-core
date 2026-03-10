from projects.models import ProjectResource


def create_resource(project, title, url, type):
    return ProjectResource.objects.create(
        project=project,
        title=title,
        url=url,
        type=type,
    )


def update_resource(resource, **kwargs):
    allowed_fields = {"title", "url", "type"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(resource, field, value)
    resource.save()
    return resource


def delete_resource(resource):
    resource.delete()
