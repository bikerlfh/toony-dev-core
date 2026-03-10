from workflows.models import WorkflowNode


def create_workflow_node(workflow, node_type, **kwargs):
    return WorkflowNode.objects.create(
        workflow=workflow,
        node_type=node_type,
        **kwargs,
    )


def update_workflow_node(node, **kwargs):
    allowed_fields = {"position_x", "position_y", "config_overrides", "order"}

    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(node, field, value)

    node.save()
    return node


def delete_workflow_node(node):
    node.delete()
