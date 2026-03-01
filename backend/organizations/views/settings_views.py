from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationAdmin, IsOrganizationMember
from organizations.selectors import get_organization_settings
from organizations.serializers.input import UpdateOrganizationSettingsSerializer
from organizations.serializers.output import OrganizationSettingsSerializer
from organizations.services import update_organization_settings


class OrganizationSettingsView(APIView):
    def get_permissions(self):
        if self.request.method == "PUT":
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get(self, request, org_slug):
        settings = get_organization_settings(request.organization)
        output = OrganizationSettingsSerializer(settings).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug):
        serializer = UpdateOrganizationSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        settings = update_organization_settings(
            request.organization,
            **serializer.validated_data,
        )
        output = OrganizationSettingsSerializer(settings).data
        return Response(output, status=status.HTTP_200_OK)
