from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from importers.models import ImportJob, ImportMapping


class ImportJobListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportJob
        fields = [
            "id",
            "provider",
            "status",
            "progress",
            "total_items",
            "imported_items",
            "created_at",
        ]
        read_only_fields = fields


class ImportJobDetailSerializer(serializers.ModelSerializer):
    started_by = UserDetailSerializer(read_only=True)

    class Meta:
        model = ImportJob
        fields = [
            "id",
            "provider",
            "status",
            "config",
            "progress",
            "total_items",
            "imported_items",
            "error_log",
            "started_by",
            "started_at",
            "completed_at",
            "created_at",
        ]
        read_only_fields = fields


class ImportMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportMapping
        fields = [
            "id",
            "external_id",
            "external_type",
            "internal_id",
            "internal_type",
            "created_at",
        ]
        read_only_fields = fields


class ExternalProjectSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    url = serializers.CharField()
