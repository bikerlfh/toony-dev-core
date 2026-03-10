from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from workflows.selectors import (
    get_workflow_by_id,
    get_workflow_edge_by_id,
    get_workflow_node_by_id,
    list_workflow_edges,
)
from workflows.serializers.input import CreateWorkflowEdgeSerializer
from workflows.serializers.output import WorkflowEdgeListSerializer
from workflows.services import create_workflow_edge, delete_workflow_edge


class WorkflowEdgeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)
        edges = list_workflow_edges(workflow)
        output = WorkflowEdgeListSerializer(edges, many=True).data
        return Response(output)

    def post(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CreateWorkflowEdgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        source = get_workflow_node_by_id(workflow, data["source_node"])
        if not source:
            return Response({"detail": "Source node not found."}, status=status.HTTP_404_NOT_FOUND)

        target = get_workflow_node_by_id(workflow, data["target_node"])
        if not target:
            return Response({"detail": "Target node not found."}, status=status.HTTP_404_NOT_FOUND)

        edge = create_workflow_edge(workflow, source, target)
        output = WorkflowEdgeListSerializer(edge).data
        return Response(output, status=status.HTTP_201_CREATED)


class WorkflowEdgeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, workflow_id, edge_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        edge = get_workflow_edge_by_id(workflow, edge_id)
        if not edge:
            return Response({"detail": "Edge not found."}, status=status.HTTP_404_NOT_FOUND)

        delete_workflow_edge(edge)
        return Response(status=status.HTTP_204_NO_CONTENT)
