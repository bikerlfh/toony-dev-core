from django.contrib import admin
from django.db import models
from jsoneditor.forms import JSONEditor

from importers.models import ImportJob, ImportMapping


@admin.register(ImportJob)
class ImportJobAdmin(admin.ModelAdmin):
    list_display = ("organization", "provider", "status", "progress", "total_items", "imported_items", "created_at")
    list_filter = ("status", "provider")
    search_fields = ("organization__name",)
    ordering = ("-created_at",)
    formfield_overrides = {models.JSONField: {"widget": JSONEditor}}


@admin.register(ImportMapping)
class ImportMappingAdmin(admin.ModelAdmin):
    list_display = ("import_job", "external_type", "external_id", "internal_type", "internal_id", "created_at")
    list_filter = ("external_type", "internal_type")
    search_fields = ("external_id",)
    ordering = ("-created_at",)
