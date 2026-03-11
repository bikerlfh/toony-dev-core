from common.exceptions import ConflictError
from workflows.models import Workflow


def create_workflow(created_by, name, slug, *, labels=None, **kwargs):
    organization = kwargs.get("organization")
    project = kwargs.get("project")

    # Check slug uniqueness within scope
    qs = Workflow.objects.filter(slug=slug)
    if organization:
        qs = qs.filter(organization=organization)
    elif project:
        qs = qs.filter(project=project)
    else:
        qs = qs.filter(
            organization__isnull=True,
            project__isnull=True,
        )

    if qs.exists():
        raise ConflictError("A workflow with this slug already exists in this scope.")

    workflow = Workflow.objects.create(
        created_by=created_by,
        name=name,
        slug=slug,
        **kwargs,
    )

    if labels:
        workflow.labels.set(labels)

    return workflow


def update_workflow(workflow, *, labels=None, **kwargs):
    allowed_fields = {
        "name",
        "description",
        "is_active",
        "organization",
        "project",
    }

    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(workflow, field, value)

    workflow.save()

    if labels is not None:
        workflow.labels.set(labels)

    return workflow


def delete_workflow(workflow):
    workflow.delete()
