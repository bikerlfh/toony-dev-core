from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from toony_agents.models import AgentTaskStatus
from toony_agents.permissions import IsToonyAgentOrgMember
from toony_agents.selectors import (
    get_task_by_id,
    get_toony_agent_by_slug,
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

    def get(self, request, org_slug, agent_slug):
        agent = get_toony_agent_by_slug(agent_slug)
        if agent is None or not agent.organizations.filter(
            id=request.organization.id,
        ).exists():
            raise NotFound("ToonyAgent not found.")
        tasks = list_tasks_for_agent(
            agent, organization=request.organization,
        )
        return self.paginate(tasks, AgentTaskListSerializer, request)

    def post(self, request, org_slug, agent_slug):
        agent = get_toony_agent_by_slug(agent_slug)
        if agent is None or not agent.organizations.filter(
            id=request.organization.id,
        ).exists():
            raise NotFound("ToonyAgent not found.")
        serializer = CreateAgentTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("toony_agent_slug", None)
        task = create_agent_task(
            organization=request.organization,
            toony_agent=agent,
            created_by=request.user,
            **data,
        )
        return Response(
            AgentTaskDetailSerializer(task).data,
            status=status.HTTP_201_CREATED,
        )


class AgentTaskDetailView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, org_slug, agent_slug, task_id):
        task = get_task_by_id(task_id)
        if task is None or task.organization_id != request.organization.id:
            raise NotFound("Task not found.")
        return Response(AgentTaskDetailSerializer(task).data)


class AgentTaskCancelView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def post(self, request, org_slug, agent_slug, task_id):
        task = get_task_by_id(task_id)
        if task is None or task.organization_id != request.organization.id:
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


class TaskEventListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, org_slug, agent_slug, task_id):
        task = get_task_by_id(task_id)
        if task is None or task.organization_id != request.organization.id:
            raise NotFound("Task not found.")
        after = request.query_params.get("after_sequence")
        after_seq = int(after) if after else None
        events = list_task_events(task, after_sequence=after_seq)
        return self.paginate(events, TaskEventSerializer, request)
