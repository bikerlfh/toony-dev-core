from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationAdmin
from organizations.selectors import get_credential_by_id, list_organization_credentials
from organizations.serializers.input import (
    CreateCredentialSerializer,
    UpdateCredentialSerializer,
)
from organizations.serializers.output import CredentialSerializer
from organizations.services import create_credential, delete_credential, update_credential


class CredentialListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get(self, request, org_slug):
        credentials = list_organization_credentials(request.organization)
        output = CredentialSerializer(credentials, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug):
        serializer = CreateCredentialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credential = create_credential(
            organization=request.organization,
            **serializer.validated_data,
        )
        output = CredentialSerializer(credential).data
        return Response(output, status=status.HTTP_201_CREATED)


class CredentialDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def get_object(self, request, credential_id):
        credential = get_credential_by_id(request.organization, credential_id)
        if credential is None:
            return None
        return credential

    def get(self, request, org_slug, credential_id):
        credential = self.get_object(request, credential_id)
        if credential is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = CredentialSerializer(credential).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, credential_id):
        credential = self.get_object(request, credential_id)
        if credential is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateCredentialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credential = update_credential(credential, **serializer.validated_data)
        output = CredentialSerializer(credential).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, credential_id):
        credential = self.get_object(request, credential_id)
        if credential is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_credential(credential)
        return Response(status=status.HTTP_204_NO_CONTENT)
