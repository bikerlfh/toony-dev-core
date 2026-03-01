from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from organizations.permissions import IsOrganizationAdmin
from organizations.selectors import get_integration_by_id, list_organization_integrations
from organizations.serializers.input import (
    CreateIntegrationSerializer,
    UpdateIntegrationSerializer,
)
from organizations.serializers.output import IntegrationConfigSerializer
from organizations.services import (
    create_integration,
    delete_integration,
    update_integration,
)


class IntegrationListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get(self, request, org_slug):
        integrations = list_organization_integrations(request.organization)
        return self.paginate(integrations, IntegrationConfigSerializer, request)

    def post(self, request, org_slug):
        serializer = CreateIntegrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        integration = create_integration(
            organization=request.organization,
            **serializer.validated_data,
        )
        output = IntegrationConfigSerializer(integration).data
        return Response(output, status=status.HTTP_201_CREATED)


class IntegrationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get_object(self, request, integration_id):
        integration = get_integration_by_id(request.organization, integration_id)
        if integration is None:
            return None
        return integration

    def get(self, request, org_slug, integration_id):
        integration = self.get_object(request, integration_id)
        if integration is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = IntegrationConfigSerializer(integration).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, integration_id):
        integration = self.get_object(request, integration_id)
        if integration is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateIntegrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        integration = update_integration(integration, **serializer.validated_data)
        output = IntegrationConfigSerializer(integration).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, integration_id):
        integration = self.get_object(request, integration_id)
        if integration is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_integration(integration)
        return Response(status=status.HTTP_204_NO_CONTENT)
