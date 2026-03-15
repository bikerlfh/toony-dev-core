from common.broadcast import broadcast
from notifications.serializers.output import NotificationSerializer


class InAppChannel:
    def send(self, notifications):
        for notification in notifications:
            broadcast(
                group_name=f"user_{notification.recipient_id}",
                event_type="notification_created",
                data=NotificationSerializer(notification).data,
            )
