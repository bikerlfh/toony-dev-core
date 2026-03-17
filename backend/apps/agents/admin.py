from django.contrib import admin
from django.db import models
from jsoneditor.forms import JSONEditor

from agents.models import Skill, SkillVersion, SubAgent, SubAgentSkill


@admin.register(SubAgent)
class SubAgentAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "agent_type", "status", "version", "created_at")
    list_filter = ("status", "agent_type")
    search_fields = ("name", "slug", "organization__name")
    exclude = ("encrypted_configuration",)
    ordering = ("-created_at",)
    formfield_overrides = {models.JSONField: {"widget": JSONEditor}}


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "category", "status", "version", "created_at")
    list_filter = ("status", "category")
    search_fields = ("name", "slug", "organization__name")
    ordering = ("-created_at",)
    formfield_overrides = {models.JSONField: {"widget": JSONEditor}}


@admin.register(SubAgentSkill)
class SubAgentSkillAdmin(admin.ModelAdmin):
    list_display = ("sub_agent", "skill", "priority", "is_enabled", "created_at")
    list_filter = ("is_enabled",)
    search_fields = ("sub_agent__name", "skill__name")
    ordering = ("sub_agent", "priority")
    formfield_overrides = {models.JSONField: {"widget": JSONEditor}}


@admin.register(SkillVersion)
class SkillVersionAdmin(admin.ModelAdmin):
    list_display = ("skill", "version", "created_by", "created_at")
    search_fields = ("skill__name", "version")
    ordering = ("-created_at",)
