import logging

from notifications.channels import InAppChannel
from notifications.models import Notification
from notifications.registry import get_handler

logger = logging.getLogger(__name__)

_channels = [InAppChannel()]


def notify(event_type: str, context: dict) -> list[Notification]:
    handler = get_handler(event_type)
    if handler is None:
        logger.warning("No handler for event: %s", event_type)
        return []

    notifications_data = handler(context)
    if not notifications_data:
        return []

    notifications = Notification.objects.bulk_create(
        [Notification(**nd.to_dict()) for nd in notifications_data]
    )

    for channel in _channels:
        channel.send(notifications)

    return notifications
