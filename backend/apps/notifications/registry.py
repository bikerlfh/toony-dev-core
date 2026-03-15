import logging

from notifications.types import NotificationHandler

logger = logging.getLogger(__name__)

_registry: dict[str, NotificationHandler] = {}


def register(event_type: str):
    def decorator(func: NotificationHandler) -> NotificationHandler:
        if event_type in _registry:
            logger.warning("Overwriting handler for event: %s", event_type)
        _registry[event_type] = func
        return func

    return decorator


def get_handler(event_type: str) -> NotificationHandler | None:
    return _registry.get(event_type)


def get_registered_events() -> list[str]:
    return list(_registry.keys())
