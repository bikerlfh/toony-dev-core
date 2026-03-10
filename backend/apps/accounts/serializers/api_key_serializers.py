from rest_framework import serializers

from accounts.models import UserAPIKey


class CreateAPIKeySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)


class APIKeyOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAPIKey
        fields = [
            "id",
            "key_prefix",
            "name",
            "is_active",
            "last_used_at",
            "created_at",
        ]
        read_only_fields = fields


class APIKeyCreatedSerializer(APIKeyOutputSerializer):
    raw_key = serializers.CharField(read_only=True)

    class Meta(APIKeyOutputSerializer.Meta):
        fields = APIKeyOutputSerializer.Meta.fields + ["raw_key"]
        read_only_fields = fields
