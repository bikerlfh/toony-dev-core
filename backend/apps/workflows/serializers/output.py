from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from workflows.models import Workflow, WorkflowEdge, WorkflowNode


class WorkflowOrgSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class WorkflowProjectSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class WorkflowLabelSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    color = serializers.CharField()


class WorkflowNodeListSerializer(serializers.ModelSerializer):
    sub_agent_slug = serializers.SlugRelatedField(source="sub_agent", slug_field="slug", read_only=True)
    skill_slug = serializers.SlugRelatedField(source="skill", slug_field="slug", read_only=True)

    class Meta:
        model = WorkflowNode
        fields = [
            "id",
            "node_type",
            "sub_agent",
            "sub_agent_slug",
            "skill",
            "skill_slug",
            "position_x",
            "position_y",
            "config_overrides",
            "order",
        ]
        read_only_fields = fields


class WorkflowEdgeListSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowEdge
        fields = ["id", "source_node", "target_node"]
        read_only_fields = fields


class WorkflowListSerializer(serializers.ModelSerializer):
    nodes_count = serializers.IntegerField(source="nodes.count", read_only=True)
    organization = WorkflowOrgSerializer(read_only=True)
    project = WorkflowProjectSerializer(read_only=True)
    labels = WorkflowLabelSerializer(many=True, read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "is_active",
            "organization",
            "project",
            "labels",
            "nodes_count",
            "created_at",
        ]
        read_only_fields = fields


class WorkflowDetailSerializer(serializers.ModelSerializer):
    created_by = UserDetailSerializer(read_only=True)
    nodes = WorkflowNodeListSerializer(many=True, read_only=True)
    edges = WorkflowEdgeListSerializer(many=True, read_only=True)
    organization = WorkflowOrgSerializer(read_only=True)
    project = WorkflowProjectSerializer(read_only=True)
    labels = WorkflowLabelSerializer(many=True, read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "is_active",
            "organization",
            "project",
            "labels",
            "created_by",
            "nodes",
            "edges",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
