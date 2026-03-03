from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from toony_agents.permissions import IsToonyAgentOrgMember
from toony_agents.selectors import (
    get_toony_agent_by_slug,
    list_agent_keys,
    list_toony_agents_for_organization,
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
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, org_slug):
        agents = list_toony_agents_for_organization(request.organization)
        return self.paginate(agents, ToonyAgentListSerializer, request)

    def post(self, request, org_slug):
        serializer = CreateToonyAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        agent = create_toony_agent(
            registered_by=request.user, **serializer.validated_data,
        )
        agent.organizations.add(request.organization)
        output = ToonyAgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_201_CREATED)


class ToonyAgentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def _get_agent(self, organization, slug):
        agent = get_toony_agent_by_slug(slug)
        if agent is None or not agent.organizations.filter(
            id=organization.id,
        ).exists():
            raise NotFound("ToonyAgent not found.")
        return agent

    def get(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        return Response(ToonyAgentDetailSerializer(agent).data)

    def put(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        serializer = UpdateToonyAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        agent = update_toony_agent(agent, **serializer.validated_data)
        return Response(ToonyAgentDetailSerializer(agent).data)

    def delete(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        delete_toony_agent(agent)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ToonyAgentKeyListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def _get_agent(self, organization, slug):
        agent = get_toony_agent_by_slug(slug)
        if agent is None or not agent.organizations.filter(
            id=organization.id,
        ).exists():
            raise NotFound("ToonyAgent not found.")
        return agent

    def get(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        keys = list_agent_keys(agent)
        return self.paginate(keys, ToonyAgentKeySerializer, request)

    def post(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
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

    def delete(self, request, org_slug, agent_slug, key_id):
        agent = get_toony_agent_by_slug(agent_slug)
        if agent is None or not agent.organizations.filter(
            id=request.organization.id,
        ).exists():
            raise NotFound("ToonyAgent not found.")
        try:
            key = agent.keys.get(id=key_id)
        except Exception:
            raise NotFound("Key not found.")
        revoke_api_key(key)
        return Response(status=status.HTTP_204_NO_CONTENT)
