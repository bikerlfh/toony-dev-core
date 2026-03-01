from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationAdmin
from agents.selectors import get_agent_by_slug, get_agent_skill_by_id, get_skill_by_id, list_agent_skills
from agents.serializers.input import CreateAgentSkillSerializer, UpdateAgentSkillSerializer
from agents.serializers.output import AgentSkillSerializer
from agents.services import assign_skill, remove_agent_skill, update_agent_skill


class AgentSkillListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get_agent(self, request, agent_slug):
        return get_agent_by_slug(request.organization, agent_slug)

    def get(self, request, org_slug, agent_slug):
        agent = self.get_agent(request, agent_slug)
        if agent is None:
            return Response({"detail": "Agent not found."}, status=status.HTTP_404_NOT_FOUND)
        agent_skills = list_agent_skills(agent)
        output = AgentSkillSerializer(agent_skills, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug, agent_slug):
        agent = self.get_agent(request, agent_slug)
        if agent is None:
            return Response({"detail": "Agent not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CreateAgentSkillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        skill_id = serializer.validated_data.pop("skill")
        skill = get_skill_by_id(request.organization, skill_id)
        if skill is None:
            return Response({"detail": "Skill not found."}, status=status.HTTP_404_NOT_FOUND)

        agent_skill = assign_skill(
            agent=agent,
            skill=skill,
            **serializer.validated_data,
        )
        output = AgentSkillSerializer(agent_skill).data
        return Response(output, status=status.HTTP_201_CREATED)


class AgentSkillDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get_objects(self, request, agent_slug, agent_skill_id):
        agent = get_agent_by_slug(request.organization, agent_slug)
        if agent is None:
            return None, None
        agent_skill = get_agent_skill_by_id(agent, agent_skill_id)
        return agent, agent_skill

    def get(self, request, org_slug, agent_slug, agent_skill_id):
        _, agent_skill = self.get_objects(request, agent_slug, agent_skill_id)
        if agent_skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = AgentSkillSerializer(agent_skill).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, agent_slug, agent_skill_id):
        _, agent_skill = self.get_objects(request, agent_slug, agent_skill_id)
        if agent_skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateAgentSkillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        agent_skill = update_agent_skill(agent_skill, **serializer.validated_data)
        output = AgentSkillSerializer(agent_skill).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, agent_slug, agent_skill_id):
        _, agent_skill = self.get_objects(request, agent_slug, agent_skill_id)
        if agent_skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        remove_agent_skill(agent_skill)
        return Response(status=status.HTTP_204_NO_CONTENT)
