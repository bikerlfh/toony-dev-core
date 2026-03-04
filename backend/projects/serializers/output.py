from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from projects.models import (
    Cycle,
    Issue,
    IssueActivity,
    IssueComment,
    Milestone,
    Project,
    ProjectMembership,
    ProjectResource,
    ProjectSettings,
)
from workspace.serializers.output import LabelSerializer


# --- Project ---

class ProjectListSerializer(serializers.ModelSerializer):
    lead = UserDetailSerializer(read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "priority",
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
    lead = UserDetailSerializer(read_only=True)
    issue_count = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id",
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


# --- Issue ---

class IssueListSerializer(serializers.ModelSerializer):
    assignee = UserDetailSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
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
