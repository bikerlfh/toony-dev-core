from rest_framework import serializers

from workflows.models.workflow_node import WorkflowNodeType


class CreateWorkflowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="", allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)
    organization = serializers.UUIDField(required=False, allow_null=True)
    project = serializers.UUIDField(required=False, allow_null=True)
    labels = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )


class UpdateWorkflowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    organization = serializers.UUIDField(required=False, allow_null=True)
    project = serializers.UUIDField(required=False, allow_null=True)
    labels = serializers.ListField(
        child=serializers.UUIDField(), required=False
    )


class CreateWorkflowNodeSerializer(serializers.Serializer):
    node_type = serializers.ChoiceField(choices=WorkflowNodeType.choices)
    sub_agent = serializers.UUIDField(required=False, allow_null=True)
    skill = serializers.UUIDField(required=False, allow_null=True)
    position_x = serializers.FloatField(required=False, default=0)
    position_y = serializers.FloatField(required=False, default=0)
    config_overrides = serializers.JSONField(required=False, default=dict)
    order = serializers.IntegerField(required=False, default=0)

    def validate(self, attrs):
        node_type = attrs.get("node_type")
        if node_type == "SUBAGENT" and not attrs.get("sub_agent"):
            raise serializers.ValidationError({"sub_agent": "Required when node_type is SUBAGENT."})
        if node_type == "SKILL" and not attrs.get("skill"):
            raise serializers.ValidationError({"skill": "Required when node_type is SKILL."})
        return attrs


class UpdateWorkflowNodeSerializer(serializers.Serializer):
    position_x = serializers.FloatField(required=False)
    position_y = serializers.FloatField(required=False)
    config_overrides = serializers.JSONField(required=False)
    order = serializers.IntegerField(required=False)


class CreateWorkflowEdgeSerializer(serializers.Serializer):
    source_node = serializers.UUIDField()
    target_node = serializers.UUIDField()
