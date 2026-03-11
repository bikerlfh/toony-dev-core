from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import OrganizationMembership
from common.mixins import PaginatedViewMixin
from toony_agents.models import AgentTaskStatus
from toony_agents.permissions import IsToonyAgentOrgMember
from toony_agents.selectors import (
    get_task_by_id,
    list_task_events,
    list_tasks_for_agent,
)
from toony_agents.serializers.input import CreateAgentTaskSerializer
from toony_agents.serializers.output import (
    AgentTaskDetailSerializer,
    AgentTaskListSerializer,
    TaskEventSerializer,
)
from toony_agents.services import create_agent_task, update_task_status


class AgentTaskListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, agent_id):
        agent = request.toony_agent
        tasks = list_tasks_for_agent(agent)
        return self.paginate(tasks, AgentTaskListSerializer, request)

    def post(self, request, agent_id):
        agent = request.toony_agent
        serializer = CreateAgentTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("toony_agent_slug", None)

        # Resolve organization
        organization_id = data.pop("organization_id")
        organization = agent.organizations.filter(id=organization_id).first()
        if not organization:
            return Response(
                {"organization_id": ["Organization not found or not assigned to this agent."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Verify user is a member
        if not OrganizationMembership.objects.filter(
            user=request.user,
            organization=organization,
            is_active=True,
        ).exists():
            return Response(
                {"organization_id": ["You are not a member of this organization."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve project (optional)
        project = None
        project_id = data.pop("project_id", None)
        if project_id:
            from projects.models import Project
            project = Project.objects.filter(
                id=project_id,
                organization=organization,
            ).first()
            if not project:
                return Response(
                    {"project_id": ["Project not found in this organization."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        task = create_agent_task(
            organization=organization,
            toony_agent=agent,
            created_by=request.user,
            project=project,
            **data,
        )
        return Response(
            AgentTaskDetailSerializer(task).data,
            status=status.HTTP_201_CREATED,
        )


class AgentTaskDetailView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def _get_task(self, request, task_id):
        task = get_task_by_id(task_id)
        if task is None:
            raise NotFound("Task not found.")
        # Verify user has membership in the task's organization
        if (
            task.organization_id
            and not OrganizationMembership.objects.filter(
                user=request.user,
                organization_id=task.organization_id,
                is_active=True,
            ).exists()
        ):
            raise NotFound("Task not found.")
        return task

    def get(self, request, agent_id, task_id):
        task = self._get_task(request, task_id)
        return Response(AgentTaskDetailSerializer(task).data)


class AgentTaskCancelView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def post(self, request, agent_id, task_id):
        task = get_task_by_id(task_id)
        if task is None:
            raise NotFound("Task not found.")
        if (
            task.organization_id
            and not OrganizationMembership.objects.filter(
                user=request.user,
                organization_id=task.organization_id,
                is_active=True,
            ).exists()
        ):
            raise NotFound("Task not found.")
        if task.status in (
            AgentTaskStatus.COMPLETED,
            AgentTaskStatus.FAILED,
            AgentTaskStatus.CANCELLED,
        ):
            return Response(
                {"detail": "Task already finished."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task = update_task_status(task, AgentTaskStatus.CANCELLED)
        return Response(AgentTaskDetailSerializer(task).data)


class TaskEventListView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, agent_id, task_id):
        task = get_task_by_id(task_id)
        if task is None:
            raise NotFound("Task not found.")
        if (
            task.organization_id
            and not OrganizationMembership.objects.filter(
                user=request.user,
                organization_id=task.organization_id,
                is_active=True,
            ).exists()
        ):
            raise NotFound("Task not found.")
        after = request.query_params.get("after_sequence")
        after_seq = int(after) if after else None
        events = list_task_events(task, after_sequence=after_seq)
        data = TaskEventSerializer(events, many=True, context={"request": request}).data
        return Response(data)
