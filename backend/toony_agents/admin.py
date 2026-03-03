from django.contrib import admin

from toony_agents.models import AgentTask, TaskEvent, ToonyAgent, ToonyAgentKey


@admin.register(ToonyAgent)
class ToonyAgentAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "registered_by", "last_heartbeat", "created_at")
    list_filter = ("status",)
    search_fields = ("name", "slug", "registered_by__email")
    ordering = ("-created_at",)


@admin.register(ToonyAgentKey)
class ToonyAgentKeyAdmin(admin.ModelAdmin):
    list_display = ("key_prefix", "name", "toony_agent", "is_active", "last_used_at", "expires_at", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "key_prefix", "toony_agent__name")
    ordering = ("-created_at",)


@admin.register(AgentTask)
class AgentTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "organization", "toony_agent", "status", "created_by", "started_at", "completed_at")
    list_filter = ("status",)
    search_fields = ("title", "organization__name", "toony_agent__name", "created_by__email")
    ordering = ("-created_at",)


@admin.register(TaskEvent)
class TaskEventAdmin(admin.ModelAdmin):
    list_display = ("task", "event_type", "sequence", "created_at")
    list_filter = ("event_type",)
    search_fields = ("task__title",)
    ordering = ("task", "sequence")
