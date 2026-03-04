from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from accounts.models import OrganizationMembership
from organizations.models import Organization
from agents.selectors import (
    get_sub_agent_by_slug,
    list_sub_agents_for_organization,
    list_sub_agents_for_user,
)
from agents.serializers.input import CreateSubAgentSerializer, UpdateSubAgentSerializer
from agents.serializers.output import SubAgentDetailSerializer, SubAgentListSerializer
from agents.services import create_sub_agent, delete_sub_agent, update_sub_agent


class SubAgentListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org_slug = request.query_params.get("organization")
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
            sub_agents = list_sub_agents_for_organization(organization)
        else:
            sub_agents = list_sub_agents_for_user(request.user)
        return self.paginate(sub_agents, SubAgentListSerializer, request)

    def post(self, request):
        serializer = CreateSubAgentSerializer(data=request.data)
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

        sub_agent = create_sub_agent(
            organization=organization,
            created_by=request.user,
            **serializer.validated_data,
        )
        output = SubAgentDetailSerializer(sub_agent).data
        return Response(output, status=status.HTTP_201_CREATED)


class SubAgentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, sub_agent_slug):
        return get_sub_agent_by_slug(sub_agent_slug)

    def get(self, request, sub_agent_slug):
        sub_agent = self.get_object(sub_agent_slug)
        if sub_agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = SubAgentDetailSerializer(sub_agent).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, sub_agent_slug):
        sub_agent = self.get_object(sub_agent_slug)
        if sub_agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateSubAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sub_agent = update_sub_agent(sub_agent, **serializer.validated_data)
        output = SubAgentDetailSerializer(sub_agent).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, sub_agent_slug):
        sub_agent = self.get_object(sub_agent_slug)
        if sub_agent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_sub_agent(sub_agent)
        return Response(status=status.HTTP_204_NO_CONTENT)
