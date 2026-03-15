from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserDetailSerializer(read_only=True)
    id = serializers.CharField(read_only=True)
    organization = serializers.CharField(source="organization_id", read_only=True)
    target_id = serializers.CharField(read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "event_type",
            "actor",
            "title",
            "body",
            "target_type",
            "target_id",
            "metadata",
            "is_read",
            "read_at",
            "organization",
            "created_at",
        ]
        read_only_fields = fields
