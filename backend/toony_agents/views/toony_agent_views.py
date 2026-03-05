from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import OrganizationMembership
from common.mixins import PaginatedViewMixin
from organizations.models import Organization
from toony_agents.permissions import IsToonyAgentOrgMember
from toony_agents.selectors import (
    get_toony_agent_by_id,
    list_agent_keys,
    list_toony_agents_for_organization,
    list_toony_agents_for_user,
)
from toony_agents.serializers.input import (
    CreateToonyAgentSerializer,
    GenerateKeySerializer,
    UpdateToonyAgentSerializer,
)
from toony_agents.serializers.output import (
    ToonyAgentDetailSerializer,
    ToonyAgentKeySerializer,
    ToonyAgentListSerializer,
)
from toony_agents.services import (
    create_toony_agent,
    delete_toony_agent,
    generate_api_key,
    revoke_api_key,
    update_toony_agent,
)


class ToonyAgentListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org_id = request.query_params.get("organization")
        if org_id:
            organization = Organization.objects.filter(id=org_id).first()
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
            agents = list_toony_agents_for_organization(organization)
        else:
            agents = list_toony_agents_for_user(request.user)
        return self.paginate(agents, ToonyAgentListSerializer, request)

    def post(self, request):
        serializer = CreateToonyAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        org_id = serializer.validated_data.pop("organization_id", None)
        organization = None
        if org_id:
            organization = Organization.objects.filter(id=org_id).first()
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

        agent = create_toony_agent(
            registered_by=request.user, **serializer.validated_data,
        )
        if organization:
            agent.organizations.add(organization)
        output = ToonyAgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_201_CREATED)


class ToonyAgentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, agent_id):
        agent = request.toony_agent
        return Response(ToonyAgentDetailSerializer(agent).data)

    def put(self, request, agent_id):
        agent = request.toony_agent
        serializer = UpdateToonyAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        agent = update_toony_agent(agent, **serializer.validated_data)
        return Response(ToonyAgentDetailSerializer(agent).data)

    def delete(self, request, agent_id):
        agent = request.toony_agent
        delete_toony_agent(agent)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ToonyAgentKeyListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, agent_id):
        agent = request.toony_agent
        keys = list_agent_keys(agent)
        return self.paginate(keys, ToonyAgentKeySerializer, request)

    def post(self, request, agent_id):
        agent = request.toony_agent
        serializer = GenerateKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key_obj, raw_key = generate_api_key(
            agent, request.user, name=serializer.validated_data["name"],
        )
        output = ToonyAgentKeySerializer(key_obj).data
        output["raw_key"] = raw_key
        return Response(output, status=status.HTTP_201_CREATED)


class ToonyAgentKeyRevokeView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def delete(self, request, agent_id, key_id):
        agent = request.toony_agent
        try:
            key = agent.keys.get(id=key_id)
        except Exception:
            raise NotFound("Key not found.")
        revoke_api_key(key)
        return Response(status=status.HTTP_204_NO_CONTENT)
