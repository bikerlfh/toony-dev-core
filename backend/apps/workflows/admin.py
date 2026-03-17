from django.contrib import admin
from django.db import models
from jsoneditor.forms import JSONEditor

from workflows.models import Workflow, WorkflowEdge, WorkflowNode


class WorkflowNodeInline(admin.TabularInline):
    model = WorkflowNode
    extra = 0
    formfield_overrides = {models.JSONField: {"widget": JSONEditor}}


class WorkflowEdgeInline(admin.TabularInline):
    model = WorkflowEdge
    extra = 0


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_active", "organization", "project", "labels_display", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug"]
    inlines = [WorkflowNodeInline, WorkflowEdgeInline]

    def labels_display(self, obj):
        return ", ".join([label.name for label in obj.labels.all()])

    labels_display.short_description = "Labels"
    labels_display.admin_order_field = "labels"

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("labels")
