from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from agents.selectors import get_skill_by_id, get_sub_agent_by_id, get_sub_agent_skill_by_id, list_sub_agent_skills
from agents.serializers.input import CreateSubAgentSkillSerializer, UpdateSubAgentSkillSerializer
from agents.serializers.output import SubAgentSkillSerializer
from agents.services import assign_skill, remove_sub_agent_skill, update_sub_agent_skill
from common.mixins import PaginatedViewMixin


class SubAgentSkillListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get_sub_agent(self, sub_agent_id):
        return get_sub_agent_by_id(sub_agent_id)

    def get(self, request, sub_agent_id):
        sub_agent = self.get_sub_agent(sub_agent_id)
        if sub_agent is None:
            return Response({"detail": "Sub-agent not found."}, status=status.HTTP_404_NOT_FOUND)
        sub_agent_skills = list_sub_agent_skills(sub_agent)
        return self.paginate(sub_agent_skills, SubAgentSkillSerializer, request)

    def post(self, request, sub_agent_id):
        sub_agent = self.get_sub_agent(sub_agent_id)
        if sub_agent is None:
            return Response({"detail": "Sub-agent not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CreateSubAgentSkillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        skill_id = serializer.validated_data.pop("skill")
        skill = get_skill_by_id(skill_id)
        if skill is None:
            return Response({"detail": "Skill not found."}, status=status.HTTP_404_NOT_FOUND)

        sub_agent_skill = assign_skill(
            sub_agent=sub_agent,
            skill=skill,
            **serializer.validated_data,
        )
        output = SubAgentSkillSerializer(sub_agent_skill).data
        return Response(output, status=status.HTTP_201_CREATED)


class SubAgentSkillDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_objects(self, sub_agent_id, sub_agent_skill_id):
        sub_agent = get_sub_agent_by_id(sub_agent_id)
        if sub_agent is None:
            return None, None
        sub_agent_skill = get_sub_agent_skill_by_id(sub_agent, sub_agent_skill_id)
        return sub_agent, sub_agent_skill

    def get(self, request, sub_agent_id, sub_agent_skill_id):
        _, sub_agent_skill = self.get_objects(sub_agent_id, sub_agent_skill_id)
        if sub_agent_skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = SubAgentSkillSerializer(sub_agent_skill).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, sub_agent_id, sub_agent_skill_id):
        _, sub_agent_skill = self.get_objects(sub_agent_id, sub_agent_skill_id)
        if sub_agent_skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateSubAgentSkillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sub_agent_skill = update_sub_agent_skill(sub_agent_skill, **serializer.validated_data)
        output = SubAgentSkillSerializer(sub_agent_skill).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, sub_agent_id, sub_agent_skill_id):
        _, sub_agent_skill = self.get_objects(sub_agent_id, sub_agent_skill_id)
        if sub_agent_skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        remove_sub_agent_skill(sub_agent_skill)
        return Response(status=status.HTTP_204_NO_CONTENT)
