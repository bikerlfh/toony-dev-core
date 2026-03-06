from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from organizations.models import Organization
from projects.models import (
    Cycle,
    Issue,
    IssueActivity,
    IssueArtifact,
    IssueComment,
    Milestone,
    Project,
    ProjectMembership,
    ProjectResource,
    ProjectSettings,
)
from workspace.serializers.output import LabelSerializer


# Inline org serializer to avoid circular import with organizations.serializers.output
class _OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "logo",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields


# --- Project ---

class ProjectListSerializer(serializers.ModelSerializer):
    lead = UserDetailSerializer(read_only=True)
    organization = _OrganizationSerializer(read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "organization",
            "name",
            "slug",
            "status",
            "priority",
            "lead",
            "start_date",
            "target_date",
            "sort_order",
            "short_summary",
            "icon",
            "color",
            "created_at",
        ]
        read_only_fields = fields


class ProjectDetailSerializer(serializers.ModelSerializer):
    lead = UserDetailSerializer(read_only=True)
    organization = _OrganizationSerializer(read_only=True)
    issue_count = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id",
            "organization",
            "name",
            "slug",
            "description",
            "short_summary",
            "status",
            "priority",
            "lead",
            "start_date",
            "target_date",
            "completed_at",
            "sort_order",
            "icon",
            "color",
            "issue_count",
            "member_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_issue_count(self, obj):
        return obj.issues.count()

    def get_member_count(self, obj):
        return obj.memberships.count()


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
    repository_credential = serializers.UUIDField(
        source="repository_credential_id", read_only=True
    )

    class Meta:
        model = ProjectSettings
        fields = [
            "id",
            "repository_url",
            "repository_credential",
            "default_branch",
            "branch_naming_convention",
            "required_reviewers_count",
            "auto_close_completed_issues",
            "issue_prefix",
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


# --- Issue ---

class IssueListSerializer(serializers.ModelSerializer):
    assignee = UserDetailSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "project_id",
            "identifier",
            "title",
            "status",
            "priority",
            "assignee",
            "labels",
            "estimate",
            "due_date",
            "sort_order",
            "created_at",
        ]
        read_only_fields = fields


class _IssueProjectSerializer(serializers.ModelSerializer):
    """Minimal project info embedded in cross-project issue listings."""
    class Meta:
        model = Project
        fields = ["id", "name", "icon", "color"]
        read_only_fields = fields


class CrossProjectIssueListSerializer(serializers.ModelSerializer):
    assignee = UserDetailSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)
    project = _IssueProjectSerializer(read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "project_id",
            "project",
            "identifier",
            "title",
            "status",
            "priority",
            "assignee",
            "labels",
            "estimate",
            "due_date",
            "sort_order",
            "created_at",
        ]
        read_only_fields = fields


class IssueDetailSerializer(serializers.ModelSerializer):
    assignee = UserDetailSerializer(read_only=True)
    reporter = UserDetailSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)
    milestone = MilestoneSerializer(read_only=True)
    cycle = CycleSerializer(read_only=True)
    parent_identifier = serializers.CharField(
        source="parent.identifier", read_only=True, default=None,
    )
    sub_issue_count = serializers.SerializerMethodField()

    class Meta:
        model = Issue
        fields = [
            "id",
            "identifier",
            "title",
            "description",
            "status",
            "priority",
            "assignee",
            "reporter",
            "labels",
            "milestone",
            "cycle",
            "parent_identifier",
            "sub_issue_count",
            "estimate",
            "due_date",
            "sort_order",
            "external_tracker_name",
            "external_tracker_url",
            "external_tracker_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_sub_issue_count(self, obj):
        return obj.sub_issues.count()


# --- Comment ---

class IssueCommentSerializer(serializers.ModelSerializer):
    author = UserDetailSerializer(read_only=True)

    class Meta:
        model = IssueComment
        fields = [
            "id",
            "author",
            "body",
            "edited_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# --- Activity ---

class IssueActivitySerializer(serializers.ModelSerializer):
    user = UserDetailSerializer(read_only=True)

    class Meta:
        model = IssueActivity
        fields = [
            "id",
            "user",
            "action",
            "field_changed",
            "old_value",
            "new_value",
            "created_at",
        ]
        read_only_fields = fields


# --- Resource ---

class ProjectResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectResource
        fields = [
            "id",
            "title",
            "url",
            "type",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# --- Artifact ---

class IssueArtifactListSerializer(serializers.ModelSerializer):
    class Meta:
        model = IssueArtifact
        fields = [
            "id",
            "title",
            "artifact_type",
            "status",
            "requires_approval",
            "issue_id",
            "agent_task_id",
            "created_at",
        ]
        read_only_fields = fields


class _ArtifactIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Issue
        fields = ["id", "identifier", "title"]
        read_only_fields = fields


class _ArtifactAgentTaskSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    status = serializers.CharField()


class IssueArtifactDetailSerializer(serializers.ModelSerializer):
    issue = _ArtifactIssueSerializer(read_only=True)
    agent_task = _ArtifactAgentTaskSerializer(read_only=True)

    class Meta:
        model = IssueArtifact
        fields = [
            "id",
            "title",
            "artifact_type",
            "content",
            "status",
            "session_id",
            "requires_approval",
            "issue",
            "agent_task",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
