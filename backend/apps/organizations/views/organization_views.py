from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from organizations.permissions import IsOrganizationAdmin, IsOrganizationOwner
from organizations.selectors import list_user_organizations
from organizations.serializers.input import (
    CreateOrganizationSerializer,
    UpdateOrganizationSerializer,
)
from organizations.serializers.output import (
    OrganizationDetailSerializer,
    OrganizationListSerializer,
)
from organizations.services import (
    create_organization,
    delete_organization,
    update_organization,
)


class OrganizationListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Organizations"],
        responses={200: OrganizationListSerializer(many=True)},
    )
    def get(self, request):
        organizations = list_user_organizations(request.user)
        return self.paginate(organizations, OrganizationListSerializer, request)

    @extend_schema(
        tags=["Organizations"],
        request=CreateOrganizationSerializer,
        responses={201: OrganizationDetailSerializer},
    )
    def post(self, request):
        serializer = CreateOrganizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        organization = create_organization(
            owner=request.user,
            **serializer.validated_data,
        )
        output = OrganizationDetailSerializer(organization).data
        return Response(output, status=status.HTTP_201_CREATED)


class OrganizationDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "DELETE":
            return [IsAuthenticated(), IsOrganizationOwner()]
        if self.request.method in ("PUT", "PATCH"):
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationAdmin()]

    @extend_schema(
        tags=["Organizations"],
        responses={200: OrganizationDetailSerializer},
    )
    def get(self, request, org_id):
        output = OrganizationDetailSerializer(request.organization).data
        return Response(output, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Organizations"],
        request=UpdateOrganizationSerializer,
        responses={200: OrganizationDetailSerializer},
    )
    def put(self, request, org_id):
        serializer = UpdateOrganizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        organization = update_organization(
            request.organization,
            **serializer.validated_data,
        )
        output = OrganizationDetailSerializer(organization).data
        return Response(output, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Organizations"],
        request=UpdateOrganizationSerializer,
        responses={200: OrganizationDetailSerializer},
    )
    def patch(self, request, org_id):
        serializer = UpdateOrganizationSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        organization = update_organization(
            request.organization,
            **serializer.validated_data,
        )
        output = OrganizationDetailSerializer(organization).data
        return Response(output, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Organizations"],
        responses={204: None},
    )
    def delete(self, request, org_id):
        delete_organization(request.organization)
        return Response(status=status.HTTP_204_NO_CONTENT)
