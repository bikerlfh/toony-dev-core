from django.contrib import admin

from agents.models import Agent, AgentSkill, Skill, SkillVersion


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "agent_type", "status", "version", "created_at")
    list_filter = ("status", "agent_type")
    search_fields = ("name", "slug", "organization__name")
    exclude = ("encrypted_configuration",)
    ordering = ("-created_at",)


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "category", "status", "version", "created_at")
    list_filter = ("status", "category")
    search_fields = ("name", "slug", "organization__name")
    ordering = ("-created_at",)


@admin.register(AgentSkill)
class AgentSkillAdmin(admin.ModelAdmin):
    list_display = ("agent", "skill", "priority", "is_enabled", "created_at")
    list_filter = ("is_enabled",)
    search_fields = ("agent__name", "skill__name")
    ordering = ("agent", "priority")


@admin.register(SkillVersion)
class SkillVersionAdmin(admin.ModelAdmin):
    list_display = ("skill", "version", "created_by", "created_at")
    search_fields = ("skill__name", "version")
    ordering = ("-created_at",)
