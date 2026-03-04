from django.contrib import admin

from workspace.models import Label, ProjectTeam, Team, TeamMembership


@admin.register(Label)
class LabelAdmin(admin.ModelAdmin):
    list_display = ("name", "color", "created_at")
    search_fields = ("name",)
    ordering = ("name",)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "identifier", "is_active", "created_at")
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


@admin.register(ProjectTeam)
class ProjectTeamAdmin(admin.ModelAdmin):
    list_display = ("project", "team", "created_at")
    search_fields = ("project__name", "team__name")
    ordering = ("-created_at",)
