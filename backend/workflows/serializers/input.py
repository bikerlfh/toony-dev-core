from rest_framework import serializers


class CreateWorkflowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="", allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)
    organization = serializers.UUIDField(required=False, allow_null=True)
    project = serializers.UUIDField(required=False, allow_null=True)
    issue = serializers.UUIDField(required=False, allow_null=True)
    label = serializers.UUIDField(required=False, allow_null=True)


class UpdateWorkflowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    label = serializers.UUIDField(required=False, allow_null=True)
