from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from agents.models import Skill, SubAgent
from workflows.selectors import (
    get_workflow_by_id,
    get_workflow_node_by_id,
    list_workflow_nodes,
)
from workflows.serializers.input import (
    CreateWorkflowNodeSerializer,
    UpdateWorkflowNodeSerializer,
)
from workflows.serializers.output import WorkflowNodeListSerializer
from workflows.services import (
    create_workflow_node,
    delete_workflow_node,
    update_workflow_node,
)


class WorkflowNodeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)
        nodes = list_workflow_nodes(workflow)
        output = WorkflowNodeListSerializer(nodes, many=True).data
        return Response(output)

    def post(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CreateWorkflowNodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        kwargs = {
            "position_x": data.get("position_x", 0),
            "position_y": data.get("position_y", 0),
            "config_overrides": data.get("config_overrides", {}),
            "order": data.get("order", 0),
        }

        if data.get("sub_agent"):
            sa = SubAgent.objects.filter(id=data["sub_agent"]).first()
            if not sa:
                return Response({"detail": "SubAgent not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["sub_agent"] = sa

        if data.get("skill"):
            sk = Skill.objects.filter(id=data["skill"]).first()
            if not sk:
                return Response({"detail": "Skill not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["skill"] = sk

        node = create_workflow_node(workflow, data["node_type"], **kwargs)
        output = WorkflowNodeListSerializer(node).data
        return Response(output, status=status.HTTP_201_CREATED)


class WorkflowNodeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, workflow_id, node_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        node = get_workflow_node_by_id(workflow, node_id)
        if not node:
            return Response({"detail": "Node not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateWorkflowNodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        node = update_workflow_node(node, **serializer.validated_data)
        output = WorkflowNodeListSerializer(node).data
        return Response(output)

    def delete(self, request, workflow_id, node_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        node = get_workflow_node_by_id(workflow, node_id)
        if not node:
            return Response({"detail": "Node not found."}, status=status.HTTP_404_NOT_FOUND)

        delete_workflow_node(node)
        return Response(status=status.HTTP_204_NO_CONTENT)
