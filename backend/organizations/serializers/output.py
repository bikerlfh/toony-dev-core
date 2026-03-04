from rest_framework import serializers

from accounts.models import OrganizationMembership
from accounts.serializers.output import UserDetailSerializer
from organizations.models import (
    IntegrationConfig,
    Organization,
    OrganizationSettings,
    RepositoryCredential,
)
from projects.serializers.output import (
    IssueListSerializer,
    ProjectListSerializer,
)
from workspace.serializers.output import LabelSerializer, TeamListSerializer


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


class CredentialSerializer(serializers.ModelSerializer):
    class Meta:
        model = RepositoryCredential
        fields = [
            "id",
            "name",
            "provider",
            "credential_type",
            "url_pattern",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class IntegrationConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationConfig
        fields = [
            "id",
            "provider",
            "webhook_url",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class GlobalSearchResultSerializer(serializers.Serializer):
    issues = IssueListSerializer(many=True, read_only=True)
    projects = ProjectListSerializer(many=True, read_only=True)
    teams = TeamListSerializer(many=True, read_only=True)
    labels = LabelSerializer(many=True, read_only=True)
