from rest_framework import serializers

from agents.models.sub_agent import SubAgentStatus, SubAgentType
from agents.models.skill import SkillCategory, SkillStatus


# --- SubAgent ---

class CreateSubAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    organization = serializers.SlugField(required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(max_length=250, required=False, default="", allow_blank=True)
    markdown = serializers.CharField(required=False, default="", allow_blank=True)
    version = serializers.CharField(max_length=50, required=False, default="0.1.0")
    status = serializers.ChoiceField(choices=SubAgentStatus.choices, required=False, default=SubAgentStatus.DRAFT)
    agent_type = serializers.ChoiceField(choices=SubAgentType.choices, required=False, default=SubAgentType.CUSTOM)
    capabilities = serializers.JSONField(required=False, default=list)
    encrypted_configuration = serializers.CharField(required=False, default="", allow_blank=True)
    is_external = serializers.BooleanField(required=False, default=False)
    external_command = serializers.CharField(required=False, default="", allow_blank=True)
    tags = serializers.JSONField(required=False, default=list)

    def validate(self, attrs):
        if attrs.get("is_external") and not attrs.get("external_command", "").strip():
            raise serializers.ValidationError(
                {"external_command": "This field is required when is_external is enabled."}
            )
        return attrs


class UpdateSubAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(max_length=250, required=False, allow_blank=True)
    markdown = serializers.CharField(required=False, allow_blank=True)
    version = serializers.CharField(max_length=50, required=False)
    status = serializers.ChoiceField(choices=SubAgentStatus.choices, required=False)
    agent_type = serializers.ChoiceField(choices=SubAgentType.choices, required=False)
    capabilities = serializers.JSONField(required=False)
    encrypted_configuration = serializers.CharField(required=False, allow_blank=True)
    is_external = serializers.BooleanField(required=False)
    external_command = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.JSONField(required=False)
    assigned_projects = serializers.ListField(
        child=serializers.UUIDField(), required=False,
    )

    def validate(self, attrs):
        if attrs.get("is_external") and not attrs.get("external_command", "").strip():
            raise serializers.ValidationError(
                {"external_command": "This field is required when is_external is enabled."}
            )
        return attrs


# --- Skill ---

class CreateSkillSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    organization = serializers.SlugField(required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, default="", allow_blank=True)
    version = serializers.CharField(max_length=50, required=False, default="0.1.0")
    status = serializers.ChoiceField(choices=SkillStatus.choices, required=False, default=SkillStatus.DRAFT)
    markdown = serializers.CharField(required=False, default="", allow_blank=True)
    category = serializers.ChoiceField(choices=SkillCategory.choices, required=False, default=SkillCategory.CUSTOM)
    input_schema = serializers.JSONField(required=False, allow_null=True, default=None)
    output_schema = serializers.JSONField(required=False, allow_null=True, default=None)
    compatible_agent_types = serializers.JSONField(required=False, default=list)
    is_external = serializers.BooleanField(required=False, default=False)
    external_command = serializers.CharField(required=False, default="", allow_blank=True)
    tags = serializers.JSONField(required=False, default=list)

    def validate(self, attrs):
        if attrs.get("is_external") and not attrs.get("external_command", "").strip():
            raise serializers.ValidationError(
                {"external_command": "This field is required when is_external is enabled."}
            )
        return attrs


class UpdateSkillSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    version = serializers.CharField(max_length=50, required=False)
    status = serializers.ChoiceField(choices=SkillStatus.choices, required=False)
    markdown = serializers.CharField(required=False, allow_blank=True)
    category = serializers.ChoiceField(choices=SkillCategory.choices, required=False)
    input_schema = serializers.JSONField(required=False, allow_null=True)
    output_schema = serializers.JSONField(required=False, allow_null=True)
    compatible_agent_types = serializers.JSONField(required=False)
    is_external = serializers.BooleanField(required=False)
    external_command = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.JSONField(required=False)
    changelog = serializers.CharField(required=False, default="", allow_blank=True)

    def validate(self, attrs):
        if attrs.get("is_external") and not attrs.get("external_command", "").strip():
            raise serializers.ValidationError(
                {"external_command": "This field is required when is_external is enabled."}
            )
        return attrs


# --- SubAgentSkill ---

class CreateSubAgentSkillSerializer(serializers.Serializer):
    skill = serializers.UUIDField()
    priority = serializers.IntegerField(required=False, default=0)
    custom_config = serializers.JSONField(required=False, allow_null=True, default=None)


class UpdateSubAgentSkillSerializer(serializers.Serializer):
    priority = serializers.IntegerField(required=False)
    is_enabled = serializers.BooleanField(required=False)
    custom_config = serializers.JSONField(required=False, allow_null=True)
