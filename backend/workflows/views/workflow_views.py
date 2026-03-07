from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from organizations.models import Organization
from projects.models import Issue, Project
from workspace.models import Label
from workflows.selectors import get_workflow_by_id, list_workflows
from workflows.serializers.input import CreateWorkflowSerializer, UpdateWorkflowSerializer
from workflows.serializers.output import WorkflowDetailSerializer, WorkflowListSerializer
from workflows.services import create_workflow, delete_workflow, update_workflow


class WorkflowListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        workflows = list_workflows()
        return self.paginate(workflows, WorkflowListSerializer, request)

    def post(self, request):
        serializer = CreateWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Resolve FK UUIDs to objects
        kwargs = {}
        if data.get("organization"):
            org = Organization.objects.filter(id=data["organization"]).first()
            if not org:
                return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["organization"] = org
        if data.get("project"):
            proj = Project.objects.filter(id=data["project"]).first()
            if not proj:
                return Response({"detail": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["project"] = proj
        if data.get("issue"):
            iss = Issue.objects.filter(id=data["issue"]).first()
            if not iss:
                return Response({"detail": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["issue"] = iss
        if data.get("label"):
            lbl = Label.objects.filter(id=data["label"]).first()
            if not lbl:
                return Response({"detail": "Label not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["label"] = lbl

        if data.get("description"):
            kwargs["description"] = data["description"]
        kwargs["is_active"] = data.get("is_active", True)

        workflow = create_workflow(
            created_by=request.user,
            name=data["name"],
            slug=data["slug"],
            **kwargs,
        )
        output = WorkflowDetailSerializer(workflow).data
        return Response(output, status=status.HTTP_201_CREATED)


class WorkflowDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = WorkflowDetailSerializer(workflow).data
        return Response(output)

    def patch(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "label" in data:
            label_id = data.pop("label")
            if label_id:
                lbl = Label.objects.filter(id=label_id).first()
                if not lbl:
                    return Response({"detail": "Label not found."}, status=status.HTTP_404_NOT_FOUND)
                data["label"] = lbl
            else:
                data["label"] = None

        workflow = update_workflow(workflow, **data)
        output = WorkflowDetailSerializer(workflow).data
        return Response(output)

    def delete(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_workflow(workflow)
        return Response(status=status.HTTP_204_NO_CONTENT)
