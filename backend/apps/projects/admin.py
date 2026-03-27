from django.contrib import admin

from projects.models import (
    Cycle,
    Issue,
    IssueActivity,
    IssueArtifact,
    IssueComment,
    Milestone,
    Project,
    ProjectFileTree,
    ProjectMembership,
    ProjectSettings,
)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "organization", "status", "priority", "created_at")
    list_filter = ("status", "priority")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("-created_at",)


@admin.register(ProjectMembership)
class ProjectMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "project", "role", "joined_at")
    list_filter = ("role",)
    search_fields = ("user__email", "project__name")
    ordering = ("-joined_at",)


@admin.register(ProjectSettings)
class ProjectSettingsAdmin(admin.ModelAdmin):
    list_display = ("project", "default_branch", "issue_prefix")
    search_fields = ("project__name",)


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display = ("name", "project", "status", "target_date", "created_at")
    list_filter = ("status",)
    search_fields = ("name", "project__name")
    ordering = ("-created_at",)


@admin.register(Cycle)
class CycleAdmin(admin.ModelAdmin):
    list_display = ("name", "number", "project", "status", "start_date", "end_date")
    list_filter = ("status",)
    search_fields = ("name", "project__name")
    ordering = ("-number",)


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ("identifier", "title", "project", "status", "priority", "assignee", "created_at")
    list_filter = ("status", "priority")
    search_fields = ("identifier", "title")
    ordering = ("-created_at",)


@admin.register(IssueComment)
class IssueCommentAdmin(admin.ModelAdmin):
    list_display = ("issue", "author", "created_at", "edited_at")
    search_fields = ("issue__identifier", "author__email")
    ordering = ("-created_at",)


@admin.register(IssueActivity)
class IssueActivityAdmin(admin.ModelAdmin):
    list_display = ("issue", "user", "action", "field_changed", "created_at")
    list_filter = ("action",)
    search_fields = ("issue__identifier", "user__email")
    ordering = ("-created_at",)


@admin.register(IssueArtifact)
class IssueArtifactAdmin(admin.ModelAdmin):
    list_display = ("title", "artifact_type", "status", "issue", "requires_approval", "created_at")
    list_filter = ("artifact_type", "status", "requires_approval")
    search_fields = ("title", "issue__identifier")
    ordering = ("-created_at",)


@admin.register(ProjectFileTree)
class ProjectFileTreeAdmin(admin.ModelAdmin):
    list_display = ("project", "branch", "file_count", "synced_at")
    search_fields = ("project__name",)
    ordering = ("-synced_at",)

    @admin.display(description="Files")
    def file_count(self, obj):
        return len(obj.tree)
