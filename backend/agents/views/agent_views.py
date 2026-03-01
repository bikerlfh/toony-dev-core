from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from organizations.permissions import IsOrganizationAdmin, IsOrganizationMember
from agents.selectors import get_agent_by_slug, list_organization_agents
from agents.serializers.input import CreateAgentSerializer, UpdateAgentSerializer
from agents.serializers.output import AgentDetailSerializer, AgentListSerializer
from agents.services import create_agent, delete_agent, update_agent


class AgentListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get(self, request, org_slug):
        agents = list_organization_agents(request.organization)
        return self.paginate(agents, AgentListSerializer, request)

    def post(self, request, org_slug):
        serializer = CreateAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        agent = create_agent(
            organization=request.organization,
            created_by=request.user,
            **serializer.validated_data,
        )
        output = AgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_201_CREATED)


class AgentDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ("PUT", "DELETE"):
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get_object(self, request, agent_slug):
        return get_agent_by_slug(request.organization, agent_slug)

    def get(self, request, org_slug, agent_slug):
        agent = self.get_object(request, agent_slug)
        if agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = AgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, agent_slug):
        agent = self.get_object(request, agent_slug)
        if agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        agent = update_agent(agent, **serializer.validated_data)
        output = AgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, agent_slug):
        agent = self.get_object(request, agent_slug)
        if agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_agent(agent)
        return Response(status=status.HTTP_204_NO_CONTENT)
