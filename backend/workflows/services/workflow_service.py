from common.exceptions import ConflictError
from workflows.models import Workflow


def create_workflow(created_by, name, slug, **kwargs):
    organization = kwargs.get("organization")
    project = kwargs.get("project")
    issue = kwargs.get("issue")

    # Check slug uniqueness within scope
    qs = Workflow.objects.filter(slug=slug)
    if organization:
        qs = qs.filter(organization=organization)
    elif project:
        qs = qs.filter(project=project)
    elif issue:
        qs = qs.filter(issue=issue)
    else:
        qs = qs.filter(
            organization__isnull=True,
            project__isnull=True,
            issue__isnull=True,
        )

    if qs.exists():
        raise ConflictError("A workflow with this slug already exists in this scope.")

    return Workflow.objects.create(
        created_by=created_by,
        name=name,
        slug=slug,
        **kwargs,
    )


def update_workflow(workflow, **kwargs):
    allowed_fields = {
        "name", "description", "is_active", "label",
    }

    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(workflow, field, value)

    workflow.save()
    return workflow


def delete_workflow(workflow):
    workflow.delete()
