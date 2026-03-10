from django.contrib import admin

from workflows.models import Workflow, WorkflowEdge, WorkflowNode


class WorkflowNodeInline(admin.TabularInline):
    model = WorkflowNode
    extra = 0


class WorkflowEdgeInline(admin.TabularInline):
    model = WorkflowEdge
    extra = 0


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_active", "organization", "project", "label", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug"]
    inlines = [WorkflowNodeInline, WorkflowEdgeInline]
