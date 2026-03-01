from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import OrganizationMembership
from accounts.selectors import get_user_by_email
from common.mixins import PaginatedViewMixin
from organizations.permissions import IsOrganizationAdmin, IsOrganizationMember
from organizations.selectors import list_organization_members
from organizations.serializers.input import AddMemberSerializer, UpdateMemberRoleSerializer
from organizations.serializers.output import MembershipSerializer
from organizations.services import add_member, remove_member, update_member_role


class MemberListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get(self, request, org_slug):
        members = list_organization_members(request.organization)
        return self.paginate(members, MembershipSerializer, request)

    def post(self, request, org_slug):
        serializer = AddMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_user_by_email(serializer.validated_data["email"])
        if user is None:
            raise NotFound("No user found with this email.")

        membership = add_member(
            organization=request.organization,
            user=user,
            role=serializer.validated_data["role"],
            invited_by=request.user,
        )
        output = MembershipSerializer(membership).data
        return Response(output, status=status.HTTP_201_CREATED)


class MemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationAdmin]

    def _get_membership(self, org, user_id):
        membership = OrganizationMembership.objects.filter(
            organization=org,
            user_id=user_id,
            is_active=True,
        ).select_related("user").first()
        if membership is None:
            raise NotFound("Membership not found.")
        return membership

    def put(self, request, org_slug, user_id):
        membership = self._get_membership(request.organization, user_id)
        serializer = UpdateMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        membership = update_member_role(
            membership,
            new_role=serializer.validated_data["role"],
        )
        output = MembershipSerializer(membership).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, user_id):
        membership = self._get_membership(request.organization, user_id)
        remove_member(membership)
        return Response(status=status.HTTP_204_NO_CONTENT)
