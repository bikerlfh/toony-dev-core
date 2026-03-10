import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def broadcast(group_name: str, event_type: str, data: dict) -> None:
    """
    Send *data* to every WebSocket in *group_name*.

    Safe to call from synchronous Django service functions.
    No-ops when the channel layer is unavailable (e.g. tests without Redis).
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {"type": event_type, "data": data},
        )
    except Exception:
        logger.exception("broadcast failed: group=%s event=%s", group_name, event_type)
