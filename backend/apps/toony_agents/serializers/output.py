from rest_framework import serializers

from toony_agents.models import AgentSystemEvent, AgentTask, TaskEvent, ToonyAgent, ToonyAgentKey


class ToonyAgentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToonyAgent
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "last_heartbeat",
            "last_connected_at",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class ToonyAgentDetailSerializer(serializers.ModelSerializer):
    registered_by = serializers.SerializerMethodField()
    organizations = serializers.SerializerMethodField()

    class Meta:
        model = ToonyAgent
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "last_heartbeat",
            "last_connected_at",
            "metadata",
            "registered_by",
            "organizations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_registered_by(self, obj):
        u = obj.registered_by
        return {
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
        }

    def get_organizations(self, obj):
        return [{"id": str(o.id), "name": o.name, "slug": o.slug} for o in obj.organizations.all()]


class ToonyAgentKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = ToonyAgentKey
        fields = [
            "id",
            "key_prefix",
            "name",
            "is_active",
            "last_used_at",
            "expires_at",
            "created_at",
        ]
        read_only_fields = fields


class AgentTaskListSerializer(serializers.ModelSerializer):
    toony_agent_slug = serializers.CharField(
        source="toony_agent.slug",
        default=None,
    )
    organization = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()
    issue = serializers.SerializerMethodField()

    class Meta:
        model = AgentTask
        fields = [
            "id",
            "title",
            "status",
            "toony_agent_slug",
            "organization",
            "project",
            "issue",
            "started_at",
            "completed_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_organization(self, obj):
        if not obj.organization:
            return None
        return {"id": str(obj.organization.id), "name": obj.organization.name}

    def get_project(self, obj):
        if not obj.project:
            return None
        return {"id": str(obj.project.id), "name": obj.project.name}

    def get_issue(self, obj):
        if not obj.issue:
            return None
        return {"id": str(obj.issue.id), "identifier": obj.issue.identifier, "title": obj.issue.title}


class AgentTaskDetailSerializer(serializers.ModelSerializer):
    toony_agent_slug = serializers.CharField(
        source="toony_agent.slug",
        default=None,
    )
    created_by = serializers.SerializerMethodField()
    organization = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()
    issue = serializers.SerializerMethodField()

    class Meta:
        model = AgentTask
        fields = [
            "id",
            "title",
            "prompt",
            "status",
            "toony_agent_slug",
            "organization",
            "project",
            "issue",
            "result",
            "error",
            "session_id",
            "started_at",
            "completed_at",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_created_by(self, obj):
        u = obj.created_by
        return {
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
        }

    def get_organization(self, obj):
        if not obj.organization:
            return None
        return {"id": str(obj.organization.id), "name": obj.organization.name}

    def get_project(self, obj):
        if not obj.project:
            return None
        return {"id": str(obj.project.id), "name": obj.project.name}

    def get_issue(self, obj):
        if not obj.issue:
            return None
        return {"id": str(obj.issue.id), "identifier": obj.issue.identifier, "title": obj.issue.title}


class TaskEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskEvent
        fields = ["id", "event_type", "data", "sequence", "created_at"]
        read_only_fields = fields


class AgentSystemEventSerializer(serializers.ModelSerializer):
    organization = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()

    class Meta:
        model = AgentSystemEvent
        fields = ["id", "event_type", "organization", "project", "data", "created_at"]
        read_only_fields = fields

    def get_organization(self, obj):
        if not obj.organization:
            return None
        return {"id": str(obj.organization.id), "name": obj.organization.name}

    def get_project(self, obj):
        if not obj.project:
            return None
        return {"id": str(obj.project.id), "name": obj.project.name}
