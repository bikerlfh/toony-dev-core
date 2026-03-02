from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from agents.models import Agent, AgentSkill, Skill, SkillVersion


# --- Agent ---

class AgentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agent
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "agent_type",
            "version",
            "is_external",
            "created_at",
        ]
        read_only_fields = fields


class AgentDetailSerializer(serializers.ModelSerializer):
    created_by = UserDetailSerializer(read_only=True)

    class Meta:
        model = Agent
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "markdown",
            "version",
            "status",
            "agent_type",
            "capabilities",
            "is_external",
            "external_command",
            "created_by",
            "tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# --- Skill ---

class SkillListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "category",
            "version",
            "is_external",
            "created_at",
        ]
        read_only_fields = fields


class SkillDetailSerializer(serializers.ModelSerializer):
    created_by = UserDetailSerializer(read_only=True)

    class Meta:
        model = Skill
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "version",
            "status",
            "content",
            "category",
            "input_schema",
            "output_schema",
            "compatible_agent_types",
            "is_external",
            "external_command",
            "created_by",
            "tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# --- AgentSkill ---

class AgentSkillSerializer(serializers.ModelSerializer):
    skill = SkillListSerializer(read_only=True)

    class Meta:
        model = AgentSkill
        fields = [
            "id",
            "skill",
            "priority",
            "is_enabled",
            "custom_config",
            "created_at",
        ]
        read_only_fields = fields


# --- SkillVersion ---

class SkillVersionSerializer(serializers.ModelSerializer):
    created_by = UserDetailSerializer(read_only=True)

    class Meta:
        model = SkillVersion
        fields = [
            "id",
            "version",
            "content",
            "changelog",
            "created_by",
            "created_at",
        ]
        read_only_fields = fields
