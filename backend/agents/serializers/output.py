from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from agents.models import Skill, SkillVersion, SubAgent, SubAgentSkill

# --- SubAgent ---


class SubAgentListSerializer(serializers.ModelSerializer):
    organization = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = SubAgent
        fields = [
            "id",
            "name",
            "slug",
            "organization",
            "description",
            "status",
            "agent_type",
            "version",
            "is_external",
            "created_at",
        ]
        read_only_fields = fields


class SubAgentDetailSerializer(serializers.ModelSerializer):
    created_by = UserDetailSerializer(read_only=True)
    organization = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = SubAgent
        fields = [
            "id",
            "name",
            "slug",
            "organization",
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
    organization = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = Skill
        fields = [
            "id",
            "name",
            "slug",
            "organization",
            "description",
            "status",
            "category",
            "version",
            "is_external",
            "created_at",
        ]
        read_only_fields = fields


class SkillDetailSerializer(serializers.ModelSerializer):
    created_by = UserDetailSerializer(read_only=True)
    organization = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = Skill
        fields = [
            "id",
            "name",
            "slug",
            "organization",
            "description",
            "version",
            "status",
            "markdown",
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


# --- SubAgentSkill ---


class SubAgentSkillSerializer(serializers.ModelSerializer):
    skill = SkillListSerializer(read_only=True)

    class Meta:
        model = SubAgentSkill
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
