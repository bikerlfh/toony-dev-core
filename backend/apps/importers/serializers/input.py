from rest_framework import serializers

from importers.models.import_job import ImportProvider


class StartImportSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=ImportProvider.choices)
    external_project_id = serializers.CharField(max_length=255)
    target_project_slug = serializers.SlugField(max_length=255)
    config = serializers.JSONField(required=False, default=dict)


class ListExternalProjectsSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=ImportProvider.choices)
