from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from projects.models import (
    Cycle,
    Label,
    Milestone,
    Project,
    ProjectMembership,
    ProjectSettings,
    Team,
    TeamMembership,
)


# --- Team ---

class TeamListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "slug",
            "identifier",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields


class TeamDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "identifier",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TeamMembershipSerializer(serializers.ModelSerializer):
    user = UserDetailSerializer(read_only=True)

    class Meta:
        model = TeamMembership
        fields = [
            "id",
            "user",
            "role",
            "joined_at",
        ]
        read_only_fields = fields


# --- Label ---

class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = [
            "id",
            "name",
            "color",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# --- Project ---

class ProjectListSerializer(serializers.ModelSerializer):
    team = TeamListSerializer(read_only=True)
    lead = UserDetailSerializer(read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "priority",
            "team",
            "lead",
            "start_date",
            "target_date",
            "sort_order",
            "icon",
            "color",
            "created_at",
        ]
        read_only_fields = fields


class ProjectDetailSerializer(serializers.ModelSerializer):
    team = TeamListSerializer(read_only=True)
    lead = UserDetailSerializer(read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "status",
            "priority",
            "team",
            "lead",
            "start_date",
            "target_date",
            "completed_at",
            "sort_order",
            "icon",
            "color",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProjectMembershipSerializer(serializers.ModelSerializer):
    user = UserDetailSerializer(read_only=True)

    class Meta:
        model = ProjectMembership
        fields = [
            "id",
            "user",
            "role",
            "joined_at",
        ]
        read_only_fields = fields


class ProjectSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectSettings
        fields = [
            "id",
            "repository_url",
            "default_branch",
            "branch_naming_convention",
            "required_reviewers_count",
            "auto_close_completed_issues",
            "issue_prefix_override",
            "estimation_method",
            "updated_at",
        ]
        read_only_fields = fields


# --- Milestone ---

class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = [
            "id",
            "name",
            "description",
            "target_date",
            "status",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# --- Cycle ---

class CycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cycle
        fields = [
            "id",
            "name",
            "number",
            "start_date",
            "end_date",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
