from django.contrib import admin

from accounts.models import OrganizationMembership
from organizations.models import (
    IntegrationConfig,
    Organization,
    OrganizationSettings,
    RepositoryCredential,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "industry", "is_active", "created_at")
    list_filter = ("is_active", "industry")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("-created_at",)


@admin.register(OrganizationSettings)
class OrganizationSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "default_project_methodology",
        "timezone",
        "audit_log_retention_days",
    )
    list_filter = ("default_project_methodology",)
    search_fields = ("organization__name",)


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "is_active", "joined_at")
    list_filter = ("role", "is_active")
    search_fields = ("user__email", "organization__name")
    ordering = ("-joined_at",)


@admin.register(RepositoryCredential)
class RepositoryCredentialAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "provider", "credential_type", "is_active", "created_at")
    list_filter = ("provider", "credential_type", "is_active")
    search_fields = ("name", "organization__name")
    exclude = ("encrypted_value",)
    ordering = ("-created_at",)


@admin.register(IntegrationConfig)
class IntegrationConfigAdmin(admin.ModelAdmin):
    list_display = ("organization", "provider", "is_active", "created_at")
    list_filter = ("provider", "is_active")
    search_fields = ("organization__name",)
    exclude = ("encrypted_credentials",)
    ordering = ("-created_at",)
