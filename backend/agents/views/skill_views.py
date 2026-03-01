from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationAdmin, IsOrganizationMember
from agents.selectors import (
    get_skill_by_slug,
    list_organization_skills,
    list_skill_versions,
)
from agents.serializers.input import CreateSkillSerializer, UpdateSkillSerializer
from agents.serializers.output import (
    SkillDetailSerializer,
    SkillListSerializer,
    SkillVersionSerializer,
)
from agents.services import create_skill, delete_skill, update_skill


class SkillListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get(self, request, org_slug):
        skills = list_organization_skills(request.organization)
        output = SkillListSerializer(skills, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug):
        serializer = CreateSkillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        skill = create_skill(
            organization=request.organization,
            created_by=request.user,
            **serializer.validated_data,
        )
        output = SkillDetailSerializer(skill).data
        return Response(output, status=status.HTTP_201_CREATED)


class SkillDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ("PUT", "DELETE"):
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get_object(self, request, skill_slug):
        return get_skill_by_slug(request.organization, skill_slug)

    def get(self, request, org_slug, skill_slug):
        skill = self.get_object(request, skill_slug)
        if skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = SkillDetailSerializer(skill).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, skill_slug):
        skill = self.get_object(request, skill_slug)
        if skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateSkillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        skill = update_skill(
            skill,
            updated_by=request.user,
            **serializer.validated_data,
        )
        output = SkillDetailSerializer(skill).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, skill_slug):
        skill = self.get_object(request, skill_slug)
        if skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_skill(skill)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SkillVersionListView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request, org_slug, skill_slug):
        skill = get_skill_by_slug(request.organization, skill_slug)
        if skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        versions = list_skill_versions(skill)
        output = SkillVersionSerializer(versions, many=True).data
        return Response(output, status=status.HTTP_200_OK)
