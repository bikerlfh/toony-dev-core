from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from workspace.models import Label, Team, TeamMembership, ProjectTeam


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


class ProjectTeamSerializer(serializers.ModelSerializer):
    team = TeamListSerializer(read_only=True)

    class Meta:
        model = ProjectTeam
        fields = [
            "id",
            "team",
            "created_at",
        ]
        read_only_fields = fields
