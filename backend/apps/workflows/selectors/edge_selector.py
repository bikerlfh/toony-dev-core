from workflows.models import WorkflowEdge


def list_workflow_edges(workflow):
    return WorkflowEdge.objects.filter(workflow=workflow)


def get_workflow_edge_by_id(workflow, edge_id):
    return WorkflowEdge.objects.filter(workflow=workflow, id=edge_id).first()
