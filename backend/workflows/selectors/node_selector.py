from workflows.models import WorkflowNode


def list_workflow_nodes(workflow):
    return WorkflowNode.objects.filter(
        workflow=workflow,
    ).select_related("sub_agent", "skill").order_by("order", "created_at")


def get_workflow_node_by_id(workflow, node_id):
    return WorkflowNode.objects.filter(
        workflow=workflow, id=node_id,
    ).select_related("sub_agent", "skill").first()
