from django.contrib import admin

from projects.models import (
    Cycle,
    Issue,
    IssueActivity,
    IssueComment,
    Milestone,
    Project,
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
    list_display = ("project", "estimation_method", "default_branch", "required_reviewers_count")
    list_filter = ("estimation_method",)
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
