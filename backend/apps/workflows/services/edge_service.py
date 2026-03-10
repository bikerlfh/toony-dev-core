from collections import defaultdict

from rest_framework.exceptions import ValidationError

from workflows.models import WorkflowEdge


def _has_cycle(workflow, new_source_id, new_target_id):
    """Check if adding an edge would create a cycle using DFS."""
    adj = defaultdict(list)
    for edge in WorkflowEdge.objects.filter(workflow=workflow):
        adj[str(edge.source_node_id)].append(str(edge.target_node_id))

    # Add the proposed edge
    adj[str(new_source_id)].append(str(new_target_id))

    visited = set()
    in_stack = set()

    def dfs(node):
        visited.add(node)
        in_stack.add(node)
        for neighbor in adj[node]:
            if neighbor in in_stack:
                return True
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
        in_stack.discard(node)
        return False

    for node in list(adj.keys()):
        if node not in visited:
            if dfs(node):
                return True
    return False


def create_workflow_edge(workflow, source_node, target_node):
    if source_node.id == target_node.id:
        raise ValidationError({"detail": "Self-loops are not allowed."})

    if source_node.workflow_id != workflow.id or target_node.workflow_id != workflow.id:
        raise ValidationError({"detail": "Both nodes must belong to the same workflow."})

    if _has_cycle(workflow, source_node.id, target_node.id):
        raise ValidationError({"detail": "Adding this edge would create a cycle in the workflow."})

    return WorkflowEdge.objects.create(
        workflow=workflow,
        source_node=source_node,
        target_node=target_node,
    )


def delete_workflow_edge(edge):
    edge.delete()
