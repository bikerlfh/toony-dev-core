from rest_framework import serializers

from accounts.models import MembershipRole
from organizations.models.settings import MethodologyChoices


class CreateOrganizationSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="")
    website = serializers.URLField(required=False, default="")
    industry = serializers.CharField(max_length=100, required=False, default="")


class UpdateOrganizationSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)
    website = serializers.URLField(required=False, allow_blank=True)
    industry = serializers.CharField(max_length=100, required=False, allow_blank=True)


class AddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=MembershipRole.choices,
        default=MembershipRole.MEMBER,
    )


class UpdateMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=MembershipRole.choices)


class UpdateOrganizationSettingsSerializer(serializers.Serializer):
    default_project_methodology = serializers.ChoiceField(
        choices=MethodologyChoices.choices,
        required=False,
    )
    timezone = serializers.CharField(max_length=100, required=False)
    notification_preferences = serializers.JSONField(required=False)
    allowed_ip_ranges = serializers.JSONField(required=False, allow_null=True)
    audit_log_retention_days = serializers.IntegerField(
        min_value=1,
        required=False,
    )
