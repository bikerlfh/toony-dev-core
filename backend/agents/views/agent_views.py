from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from accounts.models import OrganizationMembership
from organizations.models import Organization
from agents.selectors import get_agent_by_slug, list_agents_for_user
from agents.serializers.input import CreateAgentSerializer, UpdateAgentSerializer
from agents.serializers.output import AgentDetailSerializer, AgentListSerializer
from agents.services import create_agent, delete_agent, update_agent


class AgentListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        agents = list_agents_for_user(request.user)
        return self.paginate(agents, AgentListSerializer, request)

    def post(self, request):
        serializer = CreateAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        org_slug = serializer.validated_data.pop("organization", None)
        organization = None
        if org_slug:
            organization = Organization.objects.filter(slug=org_slug).first()
            if organization is None:
                return Response(
                    {"detail": "Organization not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if not OrganizationMembership.objects.filter(
                user=request.user, organization=organization, is_active=True,
            ).exists():
                return Response(
                    {"detail": "You are not a member of this organization."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        agent = create_agent(
            organization=organization,
            created_by=request.user,
            **serializer.validated_data,
        )
        output = AgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_201_CREATED)


class AgentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, agent_slug):
        return get_agent_by_slug(agent_slug)

    def get(self, request, agent_slug):
        agent = self.get_object(agent_slug)
        if agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = AgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, agent_slug):
        agent = self.get_object(agent_slug)
        if agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        agent = update_agent(agent, **serializer.validated_data)
        output = AgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, agent_slug):
        agent = self.get_object(agent_slug)
        if agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_agent(agent)
        return Response(status=status.HTTP_204_NO_CONTENT)
