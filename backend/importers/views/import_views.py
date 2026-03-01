from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationAdmin
from projects.selectors.project_selector import get_project_by_slug
from importers.selectors import (
    get_import_job_by_id,
    list_import_mappings,
    list_organization_import_jobs,
)
from importers.serializers.input import ListExternalProjectsSerializer, StartImportSerializer
from importers.serializers.output import (
    ExternalProjectSerializer,
    ImportJobDetailSerializer,
    ImportJobListSerializer,
    ImportMappingSerializer,
)
from importers.services import list_external_projects, start_import


class ImportJobListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get(self, request, org_slug):
        jobs = list_organization_import_jobs(request.organization)
        output = ImportJobListSerializer(jobs, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug):
        serializer = StartImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_project_slug = serializer.validated_data.pop("target_project_slug")
        project = get_project_by_slug(request.organization, target_project_slug)
        if project is None:
            return Response(
                {"detail": "Target project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        import_job = start_import(
            organization=request.organization,
            started_by=request.user,
            provider=serializer.validated_data["provider"],
            external_project_id=serializer.validated_data["external_project_id"],
            target_project=project,
            config=serializer.validated_data.get("config"),
        )
        output = ImportJobDetailSerializer(import_job).data
        return Response(output, status=status.HTTP_201_CREATED)


class ImportJobDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get(self, request, org_slug, job_id):
        job = get_import_job_by_id(request.organization, job_id)
        if job is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = ImportJobDetailSerializer(job).data
        return Response(output, status=status.HTTP_200_OK)


class ImportJobMappingsView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get(self, request, org_slug, job_id):
        job = get_import_job_by_id(request.organization, job_id)
        if job is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        mappings = list_import_mappings(job)
        output = ImportMappingSerializer(mappings, many=True).data
        return Response(output, status=status.HTTP_200_OK)


class ExternalProjectsView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def post(self, request, org_slug):
        serializer = ListExternalProjectsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        projects = list_external_projects(
            organization=request.organization,
            provider=serializer.validated_data["provider"],
        )
        output = ExternalProjectSerializer(projects, many=True).data
        return Response(output, status=status.HTTP_200_OK)
