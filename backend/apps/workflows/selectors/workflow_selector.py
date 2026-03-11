from workflows.models import Workflow


def list_workflows():
    return Workflow.objects.all().order_by("name")


def get_workflow_by_id(workflow_id):
    return (
        Workflow.objects.filter(id=workflow_id)
        .select_related("organization", "project", "created_by")
        .prefetch_related("nodes", "edges", "labels")
        .first()
    )
