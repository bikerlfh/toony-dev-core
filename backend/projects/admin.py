from django.contrib import admin

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


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "identifier", "organization", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug", "identifier")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("-created_at",)


@admin.register(TeamMembership)
class TeamMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "team", "role", "joined_at")
    list_filter = ("role",)
    search_fields = ("user__email", "team__name")
    ordering = ("-joined_at",)


@admin.register(Label)
class LabelAdmin(admin.ModelAdmin):
    list_display = ("name", "color", "organization", "created_at")
    search_fields = ("name",)
    ordering = ("name",)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "organization", "team", "status", "priority", "created_at")
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
