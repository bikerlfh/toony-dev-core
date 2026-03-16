from rest_framework import serializers

from accounts.models import MembershipRole
from organizations.models.credential import CredentialProvider, CredentialType
from organizations.models.integration import IntegrationProvider


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
    is_active = serializers.BooleanField(required=False)


class AddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=MembershipRole.choices,
        default=MembershipRole.MEMBER,
    )


class UpdateMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=MembershipRole.choices)


# --- Credential ---


class CreateCredentialSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    provider = serializers.ChoiceField(choices=CredentialProvider.choices)
    credential_type = serializers.ChoiceField(choices=CredentialType.choices)
    encrypted_value = serializers.CharField()
    url_pattern = serializers.CharField(max_length=500, required=False, default="")


class UpdateCredentialSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    provider = serializers.ChoiceField(choices=CredentialProvider.choices, required=False)
    credential_type = serializers.ChoiceField(choices=CredentialType.choices, required=False)
    encrypted_value = serializers.CharField(required=False)
    url_pattern = serializers.CharField(max_length=500, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


# --- Integration ---


class CreateIntegrationSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=IntegrationProvider.choices)
    encrypted_credentials = serializers.CharField()
    webhook_url = serializers.URLField(required=False, default="", allow_blank=True)


class UpdateIntegrationSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=IntegrationProvider.choices, required=False)
    encrypted_credentials = serializers.CharField(required=False)
    webhook_url = serializers.URLField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
