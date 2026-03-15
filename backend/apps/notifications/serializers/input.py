from rest_framework import serializers


class MarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=100,
    )


class MarkAllReadSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField(required=False, allow_null=True)
