from rest_framework import serializers

from projects.models import (
    CycleStatus,
    EstimationMethod,
    MilestoneStatus,
    ProjectMemberRole,
    ProjectPriority,
    ProjectStatus,
    TeamRole,
)


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


# --- Label ---

class CreateLabelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    color = serializers.CharField(max_length=7, default="#6b7280")
    description = serializers.CharField(required=False, default="")


class UpdateLabelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    color = serializers.CharField(max_length=7, required=False)
    description = serializers.CharField(required=False)


# --- Project ---

class CreateProjectSerializer(serializers.Serializer):
    team_slug = serializers.SlugField()
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="")
    status = serializers.ChoiceField(
        choices=ProjectStatus.choices, required=False,
    )
    priority = serializers.ChoiceField(
        choices=ProjectPriority.choices, required=False,
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    target_date = serializers.DateField(required=False, allow_null=True)


class UpdateProjectSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)
    status = serializers.ChoiceField(
        choices=ProjectStatus.choices, required=False,
    )
    priority = serializers.ChoiceField(
        choices=ProjectPriority.choices, required=False,
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    target_date = serializers.DateField(required=False, allow_null=True)
    sort_order = serializers.IntegerField(required=False)
    icon = serializers.CharField(max_length=50, required=False, allow_blank=True)
    color = serializers.CharField(max_length=7, required=False, allow_blank=True)


class AddProjectMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=ProjectMemberRole.choices,
        default=ProjectMemberRole.CONTRIBUTOR,
    )


class UpdateProjectMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ProjectMemberRole.choices)


class UpdateProjectSettingsSerializer(serializers.Serializer):
    repository_url = serializers.URLField(required=False, allow_blank=True)
    default_branch = serializers.CharField(max_length=255, required=False)
    branch_naming_convention = serializers.CharField(
        max_length=255, required=False, allow_blank=True,
    )
    required_reviewers_count = serializers.IntegerField(
        min_value=0, required=False,
    )
    auto_close_completed_issues = serializers.BooleanField(required=False)
    issue_prefix_override = serializers.CharField(
        max_length=10, required=False, allow_blank=True,
    )
    estimation_method = serializers.ChoiceField(
        choices=EstimationMethod.choices, required=False,
    )


# --- Milestone ---

class CreateMilestoneSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, default="")
    target_date = serializers.DateField(required=False, allow_null=True)
    sort_order = serializers.IntegerField(required=False, default=0)


class UpdateMilestoneSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)
    target_date = serializers.DateField(required=False, allow_null=True)
    status = serializers.ChoiceField(
        choices=MilestoneStatus.choices, required=False,
    )
    sort_order = serializers.IntegerField(required=False)


# --- Cycle ---

class CreateCycleSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class UpdateCycleSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    status = serializers.ChoiceField(
        choices=CycleStatus.choices, required=False,
    )
