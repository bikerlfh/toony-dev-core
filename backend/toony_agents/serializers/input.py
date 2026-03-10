from rest_framework import serializers


class CreateToonyAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=100)
    metadata = serializers.JSONField(required=False, default=dict)
    organization_id = serializers.UUIDField(required=False)


class UpdateToonyAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    metadata = serializers.JSONField(required=False)
    organization_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
    )


class GenerateKeySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, default="default")


class CreateAgentTaskSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500)
    prompt = serializers.CharField()
    toony_agent_slug = serializers.SlugField(required=False)
