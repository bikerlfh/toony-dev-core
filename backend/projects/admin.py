from django.contrib import admin

from projects.models import Label, Team, TeamMembership


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
