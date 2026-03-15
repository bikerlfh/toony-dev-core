from dataclasses import dataclass, field
from typing import Callable
from uuid import UUID

from accounts.models import User
from organizations.models import Organization


@dataclass
class NotificationData:
    recipient: User
    organization: Organization
    event_type: str
    title: str
    target_type: str
    target_id: UUID
    actor: User | None = None
    body: str = ""
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {
            "recipient": self.recipient,
            "organization": self.organization,
            "event_type": self.event_type,
            "actor": self.actor,
            "title": self.title,
            "body": self.body,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "metadata": self.metadata,
        }


EventContext = dict
NotificationHandler = Callable[[EventContext], list[NotificationData]]
