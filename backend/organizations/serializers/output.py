from rest_framework import serializers

from accounts.models import OrganizationMembership
from accounts.serializers.output import UserDetailSerializer
from organizations.models import Organization, OrganizationSettings


class OrganizationListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "logo",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields


class OrganizationDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "logo",
            "website",
            "industry",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class MembershipSerializer(serializers.ModelSerializer):
    user = UserDetailSerializer(read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = [
            "id",
            "user",
            "role",
            "joined_at",
            "is_active",
        ]
        read_only_fields = fields


class OrganizationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationSettings
        fields = [
            "id",
            "default_project_methodology",
            "timezone",
            "notification_preferences",
            "allowed_ip_ranges",
            "audit_log_retention_days",
            "updated_at",
        ]
        read_only_fields = fields
