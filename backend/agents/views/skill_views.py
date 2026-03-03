from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from accounts.models import OrganizationMembership
from organizations.models import Organization
from agents.selectors import (
    get_skill_by_slug,
    list_skills_for_organization,
    list_skills_for_user,
    list_skill_versions,
)
from agents.serializers.input import CreateSkillSerializer, UpdateSkillSerializer
from agents.serializers.output import (
    SkillDetailSerializer,
    SkillListSerializer,
    SkillVersionSerializer,
)
from agents.services import create_skill, delete_skill, update_skill


class SkillListCreateView(PaginatedViewMixin, APIView):
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
            skills = list_skills_for_organization(organization)
        else:
            skills = list_skills_for_user(request.user)
        return self.paginate(skills, SkillListSerializer, request)

    def post(self, request):
        serializer = CreateSkillSerializer(data=request.data)
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

        skill = create_skill(
            organization=organization,
            created_by=request.user,
            **serializer.validated_data,
        )
        output = SkillDetailSerializer(skill).data
        return Response(output, status=status.HTTP_201_CREATED)


class SkillDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, skill_slug):
        return get_skill_by_slug(skill_slug)

    def get(self, request, skill_slug):
        skill = self.get_object(skill_slug)
        if skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = SkillDetailSerializer(skill).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, skill_slug):
        skill = self.get_object(skill_slug)
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

    def delete(self, request, skill_slug):
        skill = self.get_object(skill_slug)
        if skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_skill(skill)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SkillVersionListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, skill_slug):
        skill = get_skill_by_slug(skill_slug)
        if skill is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        versions = list_skill_versions(skill)
        return self.paginate(versions, SkillVersionSerializer, request)
