from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from organizations.models import Organization
from projects.models import Project
from workflows.selectors import get_workflow_by_id, list_workflows
from workflows.serializers.input import (
    CreateWorkflowSerializer,
    UpdateWorkflowSerializer,
)
from workflows.serializers.output import (
    WorkflowDetailSerializer,
    WorkflowListSerializer,
)
from workflows.services import (
    create_workflow,
    delete_workflow,
    update_workflow,
)
from workspace.models import Label


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

        # Resolve label UUIDs
        label_ids = data.get("labels", [])
        label_objs = []
        if label_ids:
            label_objs = list(Label.objects.filter(id__in=label_ids))
            if len(label_objs) != len(label_ids):
                return Response({"detail": "One or more labels not found."}, status=status.HTTP_404_NOT_FOUND)

        if data.get("description"):
            kwargs["description"] = data["description"]
        kwargs["is_active"] = data.get("is_active", True)

        workflow = create_workflow(
            created_by=request.user,
            name=data["name"],
            slug=data["slug"],
            labels=label_objs,
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

        # Handle labels M2M
        labels = None
        if "labels" in data:
            label_ids = data.pop("labels")
            if label_ids:
                label_objs = list(Label.objects.filter(id__in=label_ids))
                if len(label_objs) != len(label_ids):
                    return Response({"detail": "One or more labels not found."}, status=status.HTTP_404_NOT_FOUND)
                labels = label_objs
            else:
                labels = []

        # Handle organization FK
        if "organization" in data:
            org_id = data.pop("organization")
            if org_id:
                org = Organization.objects.filter(id=org_id).first()
                if not org:
                    return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)
                data["organization"] = org
            else:
                data["organization"] = None

        # Handle project FK
        if "project" in data:
            project_id = data.pop("project")
            if project_id:
                proj = Project.objects.filter(id=project_id).first()
                if not proj:
                    return Response({"detail": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
                data["project"] = proj
            else:
                data["project"] = None

        workflow = update_workflow(workflow, labels=labels, **data)
        output = WorkflowDetailSerializer(workflow).data
        return Response(output)

    def delete(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_workflow(workflow)
        return Response(status=status.HTTP_204_NO_CONTENT)
