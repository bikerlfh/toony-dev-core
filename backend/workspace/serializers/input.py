from rest_framework import serializers

from workspace.models import TeamRole


# --- Label ---

class CreateLabelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    color = serializers.CharField(max_length=7, default="#6b7280")
    description = serializers.CharField(required=False, default="")


class UpdateLabelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    color = serializers.CharField(max_length=7, required=False)
    description = serializers.CharField(required=False)


# --- Team ---

class CreateTeamSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    identifier = serializers.CharField(max_length=10)
    description = serializers.CharField(required=False, default="")


class UpdateTeamSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)


class AddTeamMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=TeamRole.choices,
        default=TeamRole.MEMBER,
    )


class UpdateTeamMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=TeamRole.choices)


# --- ProjectTeam ---

class AddProjectTeamSerializer(serializers.Serializer):
    team_id = serializers.UUIDField()
