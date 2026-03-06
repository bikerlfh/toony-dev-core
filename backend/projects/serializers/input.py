from rest_framework import serializers

from projects.models import (
    ArtifactStatus,
    ArtifactType,
    CycleStatus,
    EstimationMethod,
    IssuePriority,
    IssueStatus,
    MilestoneStatus,
    ProjectMemberRole,
    ProjectPriority,
    ProjectStatus,
    ResourceType,
)


# --- Project ---

class CreateProjectSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField()
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="")
    short_summary = serializers.CharField(
        max_length=255, required=False, default="",
    )
    status = serializers.ChoiceField(
        choices=ProjectStatus.choices, required=False,
    )
    priority = serializers.ChoiceField(
        choices=ProjectPriority.choices, required=False,
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    target_date = serializers.DateField(required=False, allow_null=True)
    issue_prefix = serializers.CharField(max_length=10)


class UpdateProjectSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)
    short_summary = serializers.CharField(
        max_length=255, required=False, allow_blank=True,
    )
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
    issue_prefix = serializers.CharField(
        max_length=10, required=False,
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


# --- Issue ---

class CreateIssueSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500)
    description = serializers.CharField(required=False, default="")
    status = serializers.ChoiceField(
        choices=IssueStatus.choices, required=False,
    )
    priority = serializers.ChoiceField(
        choices=IssuePriority.choices, required=False,
    )
    assignee_id = serializers.UUIDField(required=False, allow_null=True)
    milestone_id = serializers.UUIDField(required=False, allow_null=True)
    cycle_id = serializers.UUIDField(required=False, allow_null=True)
    parent_identifier = serializers.CharField(max_length=30, required=False)
    label_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list,
    )
    estimate = serializers.IntegerField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    sort_order = serializers.IntegerField(required=False, default=0)


class UpdateIssueSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500, required=False)
    description = serializers.CharField(required=False)
    status = serializers.ChoiceField(
        choices=IssueStatus.choices, required=False,
    )
    priority = serializers.ChoiceField(
        choices=IssuePriority.choices, required=False,
    )
    assignee_id = serializers.UUIDField(required=False, allow_null=True)
    milestone_id = serializers.UUIDField(required=False, allow_null=True)
    cycle_id = serializers.UUIDField(required=False, allow_null=True)
    parent_identifier = serializers.CharField(max_length=30, required=False, allow_null=True)
    label_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False,
    )
    estimate = serializers.IntegerField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    sort_order = serializers.IntegerField(required=False)
    external_tracker_name = serializers.CharField(
        max_length=100, required=False, allow_blank=True,
    )
    external_tracker_url = serializers.URLField(required=False, allow_blank=True)
    external_tracker_id = serializers.CharField(
        max_length=255, required=False, allow_blank=True,
    )


# --- Comment ---

class CreateCommentSerializer(serializers.Serializer):
    body = serializers.CharField()


class UpdateCommentSerializer(serializers.Serializer):
    body = serializers.CharField()


# --- Resource ---

class CreateProjectResourceSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    url = serializers.URLField()
    type = serializers.ChoiceField(choices=ResourceType.choices)


class UpdateProjectResourceSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False)
    url = serializers.URLField(required=False)
    type = serializers.ChoiceField(choices=ResourceType.choices, required=False)


# --- Artifact ---

class CreateArtifactSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500)
    artifact_type = serializers.ChoiceField(choices=ArtifactType.choices)
    content = serializers.CharField()
    session_id = serializers.CharField(max_length=255)
    agent_task_id = serializers.UUIDField()
    requires_approval = serializers.BooleanField(default=False)


class UpdateArtifactSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500, required=False)
    content = serializers.CharField(required=False)
    status = serializers.ChoiceField(choices=ArtifactStatus.choices, required=False)
    requires_approval = serializers.BooleanField(required=False)


# --- IssueDocument ---

ALLOWED_DOCUMENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
}

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class UploadIssueDocumentSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, file):
        import os

        ext = os.path.splitext(file.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f"File type '{ext}' is not allowed. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        content_type = file.content_type or ""
        if content_type not in ALLOWED_DOCUMENT_TYPES:
            raise serializers.ValidationError(
                f"Content type '{content_type}' is not allowed."
            )

        if file.size > MAX_FILE_SIZE:
            raise serializers.ValidationError(
                f"File size {file.size} bytes exceeds maximum of {MAX_FILE_SIZE} bytes (10 MB)."
            )

        return file
