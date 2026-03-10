from collections import defaultdict

import yaml
from django.http import HttpResponse
from rest_framework import status
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.models import Issue
from workflows.selectors import resolve_workflow_for_issue
from workflows.serializers.output import WorkflowDetailSerializer


def _workflow_to_yaml(workflow):
    """Serialize a workflow to YAML string for the executor."""
    # Build adjacency: target_node_id → list of source slug IDs
    edge_map = defaultdict(list)
    node_id_to_slug = {}

    for node in workflow.nodes.all():
        ref = node.sub_agent or node.skill
        slug = ref.slug if ref else str(node.id)
        node_id_to_slug[str(node.id)] = slug

    for edge in workflow.edges.all():
        source_slug = node_id_to_slug.get(str(edge.source_node_id))
        target_id = str(edge.target_node_id)
        edge_map[target_id].append(source_slug)

    nodes = []
    for node in workflow.nodes.all().order_by("order", "created_at"):
        ref = node.sub_agent or node.skill
        slug = ref.slug if ref else str(node.id)
        entry = {
            "id": slug,
            "type": node.node_type.lower(),
            "slug": slug,
        }
        if node.config_overrides:
            entry["config_overrides"] = node.config_overrides
        deps = edge_map.get(str(node.id))
        if deps:
            entry["depends_on"] = deps
        nodes.append(entry)

    data = {
        "name": workflow.name,
        "slug": workflow.slug,
        "description": workflow.description,
        "nodes": nodes,
    }
    return yaml.dump(data, default_flow_style=False, sort_keys=False)


class _IgnoreFormatQueryParam(DefaultContentNegotiation):
    """Skip DRF's built-in ?format= renderer filtering so the view can
    handle the query param itself (e.g. returning a plain HttpResponse
    with content_type='text/yaml').

    Without this, DRF's ``filter_renderers`` raises ``Http404`` when
    ``?format=yaml`` is passed because no renderer has ``format='yaml'``.
    """

    def select_renderer(self, request, renderers, format_suffix=None):
        # Always delegate to the parent with *no* format hint so that
        # the ``?format=`` query param is never used for renderer filtering.
        return renderers[0], renderers[0].media_type


class WorkflowResolveView(APIView):
    permission_classes = [IsAuthenticated]
    content_negotiation_class = _IgnoreFormatQueryParam

    def get(self, request, issue_id):
        issue = (
            Issue.objects.filter(id=issue_id)
            .select_related(
                "project__organization",
            )
            .prefetch_related("labels")
            .first()
        )

        if not issue:
            return Response({"detail": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        workflow = resolve_workflow_for_issue(issue)
        if not workflow:
            return Response(
                {"detail": "No workflow found for this issue."},
                status=status.HTTP_404_NOT_FOUND,
            )

        fmt = request.query_params.get("format")
        if fmt == "yaml":
            yaml_content = _workflow_to_yaml(workflow)
            return HttpResponse(yaml_content, content_type="text/yaml")

        output = WorkflowDetailSerializer(workflow).data
        return Response(output)
