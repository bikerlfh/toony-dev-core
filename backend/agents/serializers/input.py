from rest_framework import serializers

from agents.models.agent import AgentStatus, AgentType
from agents.models.skill import SkillCategory, SkillStatus


# --- Agent ---

class CreateAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="")
    version = serializers.CharField(max_length=50, required=False, default="0.1.0")
    status = serializers.ChoiceField(choices=AgentStatus.choices, required=False, default=AgentStatus.DRAFT)
    agent_type = serializers.ChoiceField(choices=AgentType.choices, required=False, default=AgentType.CUSTOM)
    capabilities = serializers.JSONField(required=False, default=list)
    encrypted_configuration = serializers.CharField(required=False, default="")
    max_concurrent_tasks = serializers.IntegerField(required=False, default=1, min_value=1)
    tags = serializers.JSONField(required=False, default=list)


class UpdateAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)
    version = serializers.CharField(max_length=50, required=False)
    status = serializers.ChoiceField(choices=AgentStatus.choices, required=False)
    agent_type = serializers.ChoiceField(choices=AgentType.choices, required=False)
    capabilities = serializers.JSONField(required=False)
    encrypted_configuration = serializers.CharField(required=False)
    max_concurrent_tasks = serializers.IntegerField(required=False, min_value=1)
    tags = serializers.JSONField(required=False)
    assigned_projects = serializers.ListField(
        child=serializers.UUIDField(), required=False,
    )


# --- Skill ---

class CreateSkillSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="")
    version = serializers.CharField(max_length=50, required=False, default="0.1.0")
    status = serializers.ChoiceField(choices=SkillStatus.choices, required=False, default=SkillStatus.DRAFT)
    content = serializers.CharField(required=False, default="")
    category = serializers.ChoiceField(choices=SkillCategory.choices, required=False, default=SkillCategory.CUSTOM)
    input_schema = serializers.JSONField(required=False, allow_null=True, default=None)
    output_schema = serializers.JSONField(required=False, allow_null=True, default=None)
    compatible_agent_types = serializers.JSONField(required=False, default=list)
    tags = serializers.JSONField(required=False, default=list)


class UpdateSkillSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)
    version = serializers.CharField(max_length=50, required=False)
    status = serializers.ChoiceField(choices=SkillStatus.choices, required=False)
    content = serializers.CharField(required=False)
    category = serializers.ChoiceField(choices=SkillCategory.choices, required=False)
    input_schema = serializers.JSONField(required=False, allow_null=True)
    output_schema = serializers.JSONField(required=False, allow_null=True)
    compatible_agent_types = serializers.JSONField(required=False)
    tags = serializers.JSONField(required=False)
    changelog = serializers.CharField(required=False, default="")


# --- AgentSkill ---

class CreateAgentSkillSerializer(serializers.Serializer):
    skill = serializers.UUIDField()
    priority = serializers.IntegerField(required=False, default=0)
    custom_config = serializers.JSONField(required=False, allow_null=True, default=None)


class UpdateAgentSkillSerializer(serializers.Serializer):
    priority = serializers.IntegerField(required=False)
    is_enabled = serializers.BooleanField(required=False)
    custom_config = serializers.JSONField(required=False, allow_null=True)
