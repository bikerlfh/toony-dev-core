# Notification System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an in-app notification system with real-time WebSocket delivery, a dropdown bell in the sidebar, and a full `/notifications` page.

**Architecture:** Event-driven with handler registry. Services call `NotificationService.notify(event_type, context)` → registry dispatches to handlers → handlers return notification data → bulk create in DB → broadcast via WebSocket. See `docs/plans/2026-03-14-notifications-design.md` for full design.

**Tech Stack:** Django 5, DRF, Django Channels (WebSocket), Next.js 15, React 19, Tailwind CSS v4, Axios.

---

### Task 1: Create the `notifications` Django app — model, migration, config

**Files:**
- Create: `backend/apps/notifications/__init__.py`
- Create: `backend/apps/notifications/apps.py`
- Create: `backend/apps/notifications/models/__init__.py`
- Create: `backend/apps/notifications/models/notification.py`
- Modify: `backend/config/settings/base.py:13-39` (add to INSTALLED_APPS)

**Step 1: Create the app directory and files**

```bash
mkdir -p backend/apps/notifications/models
touch backend/apps/notifications/__init__.py
```

```python
# backend/apps/notifications/apps.py
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"
```

```python
# backend/apps/notifications/models/notification.py
from django.db import models

from common.models import BaseModel


class Notification(BaseModel):
    recipient = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    event_type = models.CharField(max_length=100)
    actor = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+",
    )
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True, default="")
    target_type = models.CharField(max_length=50)
    target_id = models.UUIDField()
    metadata = models.JSONField(default=dict)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} → {self.recipient}"
```

```python
# backend/apps/notifications/models/__init__.py
from notifications.models.notification import Notification

__all__ = ["Notification"]
```

**Step 2: Add to INSTALLED_APPS**

In `backend/config/settings/base.py`, add `"notifications"` after `"importers"` in the local apps section:

```python
    # Local apps
    "common",
    "accounts",
    "organizations",
    "projects",
    "workspace",
    "agents",
    "workflows",
    "toony_agents",
    "importers",
    "notifications",  # ← add
```

**Step 3: Generate and run migration**

```bash
docker compose exec backend python manage.py makemigrations notifications
docker compose exec backend python manage.py migrate
```

**Step 4: Verify**

```bash
docker compose exec backend python -c "from notifications.models import Notification; print('OK')"
```

**Step 5: Commit**

```
feat(notifications): add Notification model and Django app

- Create notifications app with Notification model (BaseModel)
- Fields: recipient, organization, event_type, actor, title, body, target_type, target_id, metadata, is_read, read_at
- Add composite index on (recipient, is_read, -created_at)
- Register app in INSTALLED_APPS
```

---

### Task 2: Registry and types

**Files:**
- Create: `backend/apps/notifications/registry.py`
- Create: `backend/apps/notifications/types.py`

**Step 1: Create the types module**

```python
# backend/apps/notifications/types.py
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


# Type alias for handler functions
EventContext = dict
NotificationHandler = Callable[[EventContext], list[NotificationData]]
```

**Step 2: Create the registry**

```python
# backend/apps/notifications/registry.py
import logging

from notifications.types import NotificationHandler

logger = logging.getLogger(__name__)

_registry: dict[str, NotificationHandler] = {}


def register(event_type: str):
    """Decorator to register a notification handler for an event type."""

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
```

**Step 3: Write tests for registry**

```python
# backend/tests/test_notifications.py
import pytest

from notifications.registry import _registry, get_handler, register
from notifications.types import NotificationData


class TestNotificationRegistry:
    def setup_method(self):
        self._original = _registry.copy()

    def teardown_method(self):
        _registry.clear()
        _registry.update(self._original)

    def test_register_and_get_handler(self):
        @register("test.event")
        def handler(context):
            return []

        assert get_handler("test.event") is handler

    def test_get_handler_returns_none_for_unknown(self):
        assert get_handler("unknown.event") is None
```

**Step 4: Run the test**

```bash
docker compose exec backend pytest tests/test_notifications.py -v
```
Expected: PASS

**Step 5: Commit**

```
feat(notifications): add handler registry and NotificationData type

- NotificationData dataclass for handler return values
- Register decorator for mapping event_type → handler function
- get_handler lookup function
- Tests for registry behavior
```

---

### Task 3: NotificationService and InAppChannel

**Files:**
- Create: `backend/apps/notifications/services.py`
- Create: `backend/apps/notifications/channels.py`
- Create: `backend/apps/notifications/serializers/__init__.py`
- Create: `backend/apps/notifications/serializers/output.py`

**Step 1: Create the output serializer (needed by channel)**

```bash
mkdir -p backend/apps/notifications/serializers
touch backend/apps/notifications/serializers/__init__.py
```

```python
# backend/apps/notifications/serializers/output.py
from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserDetailSerializer(read_only=True)

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
```

Note: Check `backend/apps/accounts/serializers/output.py` for the exact name of the user serializer. It should be `UserDetailSerializer` or similar — look at how `IssueListSerializer` references the assignee serializer.

**Step 2: Create InAppChannel**

```python
# backend/apps/notifications/channels.py
from common.broadcast import broadcast
from notifications.serializers.output import NotificationSerializer


class InAppChannel:
    """Delivers notifications in real-time via WebSocket."""

    def send(self, notifications):
        for notification in notifications:
            broadcast(
                group_name=f"user_{notification.recipient_id}",
                event_type="notification_created",
                data=NotificationSerializer(notification).data,
            )
```

**Step 3: Create NotificationService**

```python
# backend/apps/notifications/services.py
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
```

**Step 4: Write tests for NotificationService**

Add to `backend/tests/test_notifications.py`:

```python
class TestNotificationService:
    def test_notify_creates_notifications(self, user, other_user, organization):
        from notifications.registry import register
        from notifications.services import notify
        from notifications.types import NotificationData

        @register("test.service_event")
        def handler(context):
            return [
                NotificationData(
                    recipient=context["recipient"],
                    organization=context["organization"],
                    event_type="test.service_event",
                    actor=context["actor"],
                    title="Test notification",
                    target_type="issue",
                    target_id=context["actor"].id,  # any UUID
                )
            ]

        notifications = notify("test.service_event", {
            "recipient": other_user,
            "organization": organization,
            "actor": user,
        })

        assert len(notifications) == 1
        assert notifications[0].recipient == other_user
        assert notifications[0].title == "Test notification"
        assert Notification.objects.filter(recipient=other_user).count() == 1

    def test_notify_unknown_event_returns_empty(self):
        from notifications.services import notify

        result = notify("nonexistent.event", {})
        assert result == []
```

**Step 5: Run tests**

```bash
docker compose exec backend pytest tests/test_notifications.py -v
```

**Step 6: Commit**

```
feat(notifications): add NotificationService with InAppChannel

- NotificationService.notify() dispatches to handler, bulk creates, broadcasts
- InAppChannel sends via WebSocket to user_{recipient_id} group
- NotificationSerializer for output
- Tests for service behavior
```

---

### Task 4: Notification handlers — issues and comments

**Files:**
- Create: `backend/apps/notifications/handlers/__init__.py`
- Create: `backend/apps/notifications/handlers/issues.py`
- Create: `backend/apps/notifications/handlers/comments.py`

**Step 1: Create handlers directory**

```bash
mkdir -p backend/apps/notifications/handlers
```

**Step 2: Create issue handlers**

```python
# backend/apps/notifications/handlers/issues.py
from notifications.registry import register
from notifications.types import NotificationData


def _issue_metadata(issue):
    return {
        "project_id": str(issue.project_id),
        "issue_identifier": issue.identifier,
    }


@register("issue.assigned")
def handle_issue_assigned(context):
    issue = context["issue"]
    actor = context["actor"]
    assignee = context["assignee"]

    if not assignee or assignee == actor:
        return []

    return [
        NotificationData(
            recipient=assignee,
            organization=issue.project.organization,
            event_type="issue.assigned",
            actor=actor,
            title=f"Te asignaron {issue.identifier}: {issue.title}",
            target_type="issue",
            target_id=issue.id,
            metadata=_issue_metadata(issue),
        )
    ]


@register("issue.status_changed")
def handle_issue_status_changed(context):
    issue = context["issue"]
    actor = context["actor"]
    old_status = context["old_status"]
    new_status = context["new_status"]

    recipients = set()
    if issue.assignee and issue.assignee != actor:
        recipients.add(issue.assignee)
    if issue.reporter and issue.reporter != actor:
        recipients.add(issue.reporter)

    metadata = _issue_metadata(issue)
    return [
        NotificationData(
            recipient=r,
            organization=issue.project.organization,
            event_type="issue.status_changed",
            actor=actor,
            title=f"{issue.identifier} pasó de {old_status} a {new_status}",
            target_type="issue",
            target_id=issue.id,
            metadata=metadata,
        )
        for r in recipients
    ]
```

**Step 3: Create comment handlers**

```python
# backend/apps/notifications/handlers/comments.py
import re

from accounts.models import User
from notifications.registry import register
from notifications.types import NotificationData


def _issue_metadata(issue):
    return {
        "project_id": str(issue.project_id),
        "issue_identifier": issue.identifier,
    }


@register("comment.created")
def handle_comment_created(context):
    issue = context["issue"]
    comment = context["comment"]
    actor = context["actor"]

    # Participants: assignee, reporter, previous commenters
    recipients = set()
    if issue.assignee and issue.assignee != actor:
        recipients.add(issue.assignee)
    if issue.reporter and issue.reporter != actor:
        recipients.add(issue.reporter)

    # Add previous commenters (excluding actor)
    from projects.models import IssueComment

    prev_authors = (
        IssueComment.objects.filter(issue=issue)
        .exclude(author=actor)
        .exclude(id=comment.id)
        .values_list("author", flat=True)
        .distinct()
    )
    commenters = User.objects.filter(id__in=prev_authors)
    recipients.update(commenters)

    actor_name = actor.first_name or actor.email.split("@")[0]
    metadata = _issue_metadata(issue)
    return [
        NotificationData(
            recipient=r,
            organization=issue.project.organization,
            event_type="comment.created",
            actor=actor,
            title=f"{actor_name} comentó en {issue.identifier}",
            target_type="issue",
            target_id=issue.id,
            metadata=metadata,
        )
        for r in recipients
    ]


@register("comment.mentioned")
def handle_comment_mentioned(context):
    issue = context["issue"]
    actor = context["actor"]
    body = context["body"]

    # Parse @email mentions
    emails = set(re.findall(r"@([\w.+-]+@[\w-]+\.[\w.-]+)", body))
    if not emails:
        return []

    mentioned_users = User.objects.filter(email__in=emails).exclude(id=actor.id)
    actor_name = actor.first_name or actor.email.split("@")[0]
    metadata = _issue_metadata(issue)
    return [
        NotificationData(
            recipient=u,
            organization=issue.project.organization,
            event_type="comment.mentioned",
            actor=actor,
            title=f"{actor_name} te mencionó en {issue.identifier}",
            target_type="issue",
            target_id=issue.id,
            metadata=metadata,
        )
        for u in mentioned_users
    ]
```

**Step 4: Create handlers __init__ to auto-register**

```python
# backend/apps/notifications/handlers/__init__.py
import notifications.handlers.comments  # noqa: F401
import notifications.handlers.issues  # noqa: F401
```

**Step 5: Import handlers in the app ready() method**

Update `backend/apps/notifications/apps.py`:

```python
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"

    def ready(self):
        import notifications.handlers  # noqa: F401
```

**Step 6: Write tests for issue/comment handlers**

Add to `backend/tests/test_notifications.py`:

```python
class TestIssueHandlers:
    def test_issue_assigned_notifies_assignee(self, issue, user, other_user):
        from notifications.handlers.issues import handle_issue_assigned

        issue.project.organization  # ensure loaded
        result = handle_issue_assigned({
            "issue": issue,
            "actor": user,
            "assignee": other_user,
        })

        assert len(result) == 1
        assert result[0].recipient == other_user
        assert result[0].event_type == "issue.assigned"
        assert issue.identifier in result[0].title

    def test_issue_assigned_skips_self_assign(self, issue, user):
        from notifications.handlers.issues import handle_issue_assigned

        result = handle_issue_assigned({
            "issue": issue,
            "actor": user,
            "assignee": user,
        })

        assert result == []

    def test_issue_status_changed_notifies_assignee_and_reporter(self, issue, user, other_user):
        from notifications.handlers.issues import handle_issue_status_changed

        issue.assignee = other_user
        issue.save()

        result = handle_issue_status_changed({
            "issue": issue,
            "actor": other_user,  # assignee makes the change
            "old_status": "BACKLOG",
            "new_status": "TODO",
        })

        # Should notify the reporter (user), but not the actor (other_user)
        assert len(result) == 1
        assert result[0].recipient == issue.reporter


class TestCommentHandlers:
    def test_comment_created_notifies_participants(self, issue, user, other_user):
        from projects.models import IssueComment

        from notifications.handlers.comments import handle_comment_created

        issue.assignee = other_user
        issue.save()
        comment = IssueComment.objects.create(issue=issue, author=user, body="test")

        result = handle_comment_created({
            "issue": issue,
            "comment": comment,
            "actor": user,
        })

        # other_user is assignee, user is reporter+actor → only other_user notified
        recipients = {nd.recipient for nd in result}
        assert other_user in recipients
        assert user not in recipients

    def test_comment_mentioned_parses_emails(self, issue, user, other_user):
        from notifications.handlers.comments import handle_comment_mentioned

        body = f"Hey @{other_user.email} check this out"
        result = handle_comment_mentioned({
            "issue": issue,
            "actor": user,
            "body": body,
        })

        assert len(result) == 1
        assert result[0].recipient == other_user

    def test_comment_mentioned_ignores_actor(self, issue, user):
        from notifications.handlers.comments import handle_comment_mentioned

        body = f"Note to self @{user.email}"
        result = handle_comment_mentioned({
            "issue": issue,
            "actor": user,
            "body": body,
        })

        assert result == []
```

**Step 7: Run tests**

```bash
docker compose exec backend pytest tests/test_notifications.py -v
```

**Step 8: Commit**

```
feat(notifications): add issue and comment notification handlers

- issue.assigned: notifies assignee (skips self-assign)
- issue.status_changed: notifies assignee + reporter (excludes actor)
- comment.created: notifies participants (assignee, reporter, prev commenters)
- comment.mentioned: parses @email from body, notifies mentioned users
- Auto-register handlers via app ready()
- Tests for all handler behaviors
```

---

### Task 5: Notification handlers — projects, agents, artifacts

**Files:**
- Create: `backend/apps/notifications/handlers/projects.py`
- Create: `backend/apps/notifications/handlers/agents.py`
- Create: `backend/apps/notifications/handlers/artifacts.py`
- Modify: `backend/apps/notifications/handlers/__init__.py`

**Step 1: Create project handlers**

```python
# backend/apps/notifications/handlers/projects.py
from notifications.registry import register
from notifications.types import NotificationData


@register("project.member_added")
def handle_project_member_added(context):
    project = context["project"]
    member = context["member"]
    actor = context["actor"]

    if member == actor:
        return []

    return [
        NotificationData(
            recipient=member,
            organization=project.organization,
            event_type="project.member_added",
            actor=actor,
            title=f"Te agregaron al proyecto {project.name}",
            target_type="project",
            target_id=project.id,
            metadata={},
        )
    ]


@register("project.member_removed")
def handle_project_member_removed(context):
    project = context["project"]
    member = context["member"]
    actor = context["actor"]

    if member == actor:
        return []

    return [
        NotificationData(
            recipient=member,
            organization=project.organization,
            event_type="project.member_removed",
            actor=actor,
            title=f"Te removieron del proyecto {project.name}",
            target_type="project",
            target_id=project.id,
            metadata={},
        )
    ]
```

**Step 2: Create agent handlers**

```python
# backend/apps/notifications/handlers/agents.py
from notifications.registry import register
from notifications.types import NotificationData


def _task_metadata(task):
    meta = {}
    if task.project_id:
        meta["project_id"] = str(task.project_id)
    if task.issue_id:
        meta["issue_id"] = str(task.issue_id)
    return meta


@register("agent_task.completed")
def handle_agent_task_completed(context):
    task = context["task"]

    return [
        NotificationData(
            recipient=task.created_by,
            organization=task.organization,
            event_type="agent_task.completed",
            actor=None,
            title=f"Tarea completada: {task.title}",
            target_type="agent_task",
            target_id=task.id,
            metadata=_task_metadata(task),
        )
    ]


@register("agent_task.failed")
def handle_agent_task_failed(context):
    task = context["task"]

    return [
        NotificationData(
            recipient=task.created_by,
            organization=task.organization,
            event_type="agent_task.failed",
            actor=None,
            title=f"Tarea fallida: {task.title}",
            body=task.error or "",
            target_type="agent_task",
            target_id=task.id,
            metadata=_task_metadata(task),
        )
    ]
```

**Step 3: Create artifact handlers**

```python
# backend/apps/notifications/handlers/artifacts.py
from notifications.registry import register
from notifications.types import NotificationData


@register("artifact.created")
def handle_artifact_created(context):
    artifact = context["artifact"]
    issue = context["issue"]
    actor = context.get("actor")

    recipients = set()
    if issue.assignee and issue.assignee != actor:
        recipients.add(issue.assignee)
    if issue.reporter and issue.reporter != actor:
        recipients.add(issue.reporter)

    metadata = {
        "project_id": str(issue.project_id),
        "issue_identifier": issue.identifier,
        "issue_id": str(issue.id),
    }

    return [
        NotificationData(
            recipient=r,
            organization=issue.project.organization,
            event_type="artifact.created",
            actor=actor,
            title=f"Nuevo artefacto en {issue.identifier}: {artifact.title}",
            target_type="artifact",
            target_id=artifact.id,
            metadata=metadata,
        )
        for r in recipients
    ]
```

**Step 4: Update handlers __init__**

```python
# backend/apps/notifications/handlers/__init__.py
import notifications.handlers.agents  # noqa: F401
import notifications.handlers.artifacts  # noqa: F401
import notifications.handlers.comments  # noqa: F401
import notifications.handlers.issues  # noqa: F401
import notifications.handlers.projects  # noqa: F401
```

**Step 5: Write tests**

Add to `backend/tests/test_notifications.py`:

```python
class TestProjectHandlers:
    def test_member_added_notifies_member(self, project, user, other_user):
        from notifications.handlers.projects import handle_project_member_added

        result = handle_project_member_added({
            "project": project,
            "member": other_user,
            "actor": user,
        })

        assert len(result) == 1
        assert result[0].recipient == other_user
        assert project.name in result[0].title

    def test_member_added_skips_self(self, project, user):
        from notifications.handlers.projects import handle_project_member_added

        result = handle_project_member_added({
            "project": project,
            "member": user,
            "actor": user,
        })

        assert result == []


class TestAgentHandlers:
    def test_task_completed_notifies_creator(self, agent_task):
        from notifications.handlers.agents import handle_agent_task_completed

        result = handle_agent_task_completed({"task": agent_task})

        assert len(result) == 1
        assert result[0].recipient == agent_task.created_by
        assert result[0].actor is None

    def test_task_failed_includes_error(self, agent_task):
        from notifications.handlers.agents import handle_agent_task_failed

        agent_task.error = "Something broke"
        agent_task.save()

        result = handle_agent_task_failed({"task": agent_task})

        assert len(result) == 1
        assert result[0].body == "Something broke"


class TestArtifactHandlers:
    def test_artifact_created_notifies_issue_participants(self, artifact, user, other_user):
        from notifications.handlers.artifacts import handle_artifact_created

        issue = artifact.issue
        issue.assignee = other_user
        issue.save()

        result = handle_artifact_created({
            "artifact": artifact,
            "issue": issue,
            "actor": user,  # user is reporter
        })

        # other_user is assignee and not actor → notified
        recipients = {nd.recipient for nd in result}
        assert other_user in recipients
```

**Step 6: Run tests**

```bash
docker compose exec backend pytest tests/test_notifications.py -v
```

**Step 7: Commit**

```
feat(notifications): add project, agent, and artifact handlers

- project.member_added/removed: notifies the affected member
- agent_task.completed/failed: notifies task creator
- artifact.created: notifies issue assignee + reporter
- Tests for all handlers
```

---

### Task 6: Selectors and input serializers

**Files:**
- Create: `backend/apps/notifications/selectors.py`
- Create: `backend/apps/notifications/serializers/input.py`

**Step 1: Create selectors**

```python
# backend/apps/notifications/selectors.py
from notifications.models import Notification


def list_user_notifications(user, *, is_read=None, organization_id=None):
    qs = (
        Notification.objects.filter(recipient=user)
        .select_related("actor")
    )

    if is_read is not None:
        qs = qs.filter(is_read=is_read)

    if organization_id:
        qs = qs.filter(organization_id=organization_id)

    return qs.order_by("-created_at")


def get_unread_count(user):
    return Notification.objects.filter(recipient=user, is_read=False).count()
```

**Step 2: Create input serializers**

```python
# backend/apps/notifications/serializers/input.py
from rest_framework import serializers


class MarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=100,
    )


class MarkAllReadSerializer(serializers.Serializer):
    organization_id = serializers.UUIDField(required=False, allow_null=True)
```

**Step 3: Commit**

```
feat(notifications): add selectors and input serializers

- list_user_notifications with is_read and organization_id filters
- get_unread_count for badge counter
- MarkReadSerializer and MarkAllReadSerializer for input validation
```

---

### Task 7: Views and URL routing

**Files:**
- Create: `backend/apps/notifications/views.py`
- Create: `backend/apps/notifications/urls.py`
- Modify: `backend/config/urls.py`

**Step 1: Create views**

```python
# backend/apps/notifications/views.py
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from notifications.models import Notification
from notifications.selectors import get_unread_count, list_user_notifications
from notifications.serializers.input import MarkAllReadSerializer, MarkReadSerializer
from notifications.serializers.output import NotificationSerializer


class NotificationListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        is_read = request.query_params.get("is_read")
        if is_read is not None:
            is_read = is_read.lower() == "true"

        organization_id = request.query_params.get("organization_id")

        notifications = list_user_notifications(
            request.user,
            is_read=is_read,
            organization_id=organization_id,
        )
        return self.paginate(notifications, NotificationSerializer, request)


class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        now = timezone.now()
        updated = Notification.objects.filter(
            recipient=request.user,
            id__in=serializer.validated_data["ids"],
            is_read=False,
        ).update(is_read=True, read_at=now)

        return Response({"updated": updated}, status=status.HTTP_200_OK)


class MarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MarkAllReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        qs = Notification.objects.filter(recipient=request.user, is_read=False)

        org_id = serializer.validated_data.get("organization_id")
        if org_id:
            qs = qs.filter(organization_id=org_id)

        now = timezone.now()
        updated = qs.update(is_read=True, read_at=now)

        return Response({"updated": updated}, status=status.HTTP_200_OK)


class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = get_unread_count(request.user)
        return Response({"count": count}, status=status.HTTP_200_OK)
```

**Step 2: Create URL conf**

```python
# backend/apps/notifications/urls.py
from django.urls import path

from notifications.views import (
    MarkAllReadView,
    MarkReadView,
    NotificationListView,
    UnreadCountView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("mark-read/", MarkReadView.as_view(), name="notification-mark-read"),
    path("mark-all-read/", MarkAllReadView.as_view(), name="notification-mark-all-read"),
    path("unread-count/", UnreadCountView.as_view(), name="notification-unread-count"),
]
```

**Step 3: Register in main urls.py**

In `backend/config/urls.py`, add after the search entry:

```python
    path("api/notifications/", include("notifications.urls")),
```

**Step 4: Write API tests**

Add to `backend/tests/test_notifications.py`:

```python
@pytest.fixture()
def notification(user, organization):
    from notifications.models import Notification

    return Notification.objects.create(
        recipient=user,
        organization=organization,
        event_type="issue.assigned",
        title="Test notification",
        target_type="issue",
        target_id=user.id,  # any UUID
    )


class TestNotificationAPI:
    def test_list_notifications(self, authenticated_client, notification):
        response = authenticated_client.get("/api/notifications/")
        assert response.status_code == 200
        assert len(response.data["results"]) == 1

    def test_list_filter_unread(self, authenticated_client, notification):
        response = authenticated_client.get("/api/notifications/?is_read=false")
        assert response.status_code == 200
        assert len(response.data["results"]) == 1

        response = authenticated_client.get("/api/notifications/?is_read=true")
        assert response.status_code == 200
        assert len(response.data["results"]) == 0

    def test_mark_read(self, authenticated_client, notification):
        response = authenticated_client.post(
            "/api/notifications/mark-read/",
            {"ids": [str(notification.id)]},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["updated"] == 1

        notification.refresh_from_db()
        assert notification.is_read is True
        assert notification.read_at is not None

    def test_mark_all_read(self, authenticated_client, notification):
        response = authenticated_client.post(
            "/api/notifications/mark-all-read/",
            {},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["updated"] == 1

    def test_unread_count(self, authenticated_client, notification):
        response = authenticated_client.get("/api/notifications/unread-count/")
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/notifications/")
        assert response.status_code == 401
```

**Step 5: Run tests**

```bash
docker compose exec backend pytest tests/test_notifications.py -v
```

**Step 6: Commit**

```
feat(notifications): add REST API views and URL routing

- GET /api/notifications/ with is_read and organization_id filters
- POST /api/notifications/mark-read/ for batch marking
- POST /api/notifications/mark-all-read/ with optional org filter
- GET /api/notifications/unread-count/ for badge counter
- API tests for all endpoints
```

---

### Task 8: WebSocket consumer and routing

**Files:**
- Create: `backend/apps/notifications/consumers.py`
- Create: `backend/apps/notifications/routing.py`
- Modify: `backend/config/routing.py`

**Step 1: Create NotificationConsumer**

Follow the pattern from `backend/apps/projects/consumers.py`:

```python
# backend/apps/notifications/consumers.py
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """User-scoped WebSocket for real-time notification delivery."""

    async def connect(self):
        user = self.scope.get("user")

        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.group_name = f"user_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        pass  # Server-push only

    async def notification_created(self, event):
        await self.send_json({"type": "notification.created", "data": event["data"]})
```

**Step 2: Create routing**

```python
# backend/apps/notifications/routing.py
from django.urls import path

from notifications.consumers import NotificationConsumer

websocket_urlpatterns = [
    path("ws/notifications/", NotificationConsumer.as_asgi()),
]
```

**Step 3: Register in main routing**

Update `backend/config/routing.py`:

```python
from agents.routing import websocket_urlpatterns as agent_ws
from notifications.routing import websocket_urlpatterns as notification_ws
from projects.routing import websocket_urlpatterns as project_ws
from toony_agents.routing import websocket_urlpatterns as toony_agent_ws

websocket_urlpatterns = project_ws + agent_ws + toony_agent_ws + notification_ws
```

**Step 4: Commit**

```
feat(notifications): add WebSocket consumer and routing

- NotificationConsumer joins user_{user_id} group
- Server-push only, JWT auth via query param
- Receives notification_created events from broadcast
```

---

### Task 9: Integrate `notify()` calls into existing services

**Files:**
- Modify: `backend/apps/projects/services/issue_service.py`
- Modify: `backend/apps/projects/services/project_service.py`
- Modify: `backend/apps/projects/services/artifact_service.py`
- Modify: `backend/apps/toony_agents/services/agent_task_service.py`

**Step 1: Integrate into issue_service.py**

In `update_issue()` (around line 136, after `issue.refresh_from_db()` and the broadcast call):

```python
    # --- Notifications ---
    from notifications.services import notify

    # Check for assignee change
    for act in activities:
        if act.field_changed == "assignee" and issue.assignee:
            notify("issue.assigned", {
                "issue": issue,
                "actor": user,
                "assignee": issue.assignee,
            })
        if act.field_changed == "status":
            notify("issue.status_changed", {
                "issue": issue,
                "actor": user,
                "old_status": act.old_value,
                "new_status": act.new_value,
            })
```

In `create_comment()` (after the broadcast call, around line 182):

```python
    # --- Notifications ---
    from notifications.services import notify

    notify("comment.created", {
        "issue": issue,
        "comment": comment,
        "actor": author,
    })
    notify("comment.mentioned", {
        "issue": issue,
        "actor": author,
        "body": body,
    })
```

**Step 2: Integrate into project_service.py**

In `add_project_member()` (after the return, but we need to capture the return first):

```python
def add_project_member(project, user, role=ProjectMemberRole.CONTRIBUTOR, actor=None):
    existing = ProjectMembership.objects.filter(
        project=project,
        user=user,
    ).first()
    if existing:
        raise ConflictError("User is already a member of this project.")
    membership = ProjectMembership.objects.create(
        project=project,
        user=user,
        role=role,
    )

    if actor:
        from notifications.services import notify

        notify("project.member_added", {
            "project": project,
            "member": user,
            "actor": actor,
        })

    return membership
```

Note: `add_project_member` currently doesn't receive `actor`. Add it as an optional kwarg `actor=None`. Check the view that calls it (`backend/apps/projects/views/project_views.py`) and pass `request.user` as `actor`.

Similarly for `remove_project_member()`:

```python
def remove_project_member(membership, actor=None):
    project = membership.project
    member = membership.user

    membership.delete()

    if actor:
        from notifications.services import notify

        notify("project.member_removed", {
            "project": project,
            "member": member,
            "actor": actor,
        })
```

Update the view that calls `remove_project_member` to pass `actor=request.user`.

**Step 3: Integrate into artifact_service.py**

In `create_artifact()`, after the broadcast call (around line 63):

```python
    # --- Notifications ---
    from notifications.services import notify

    notify("artifact.created", {
        "artifact": artifact,
        "issue": issue,
        "actor": None,  # artifacts are created by agents, no human actor
    })
```

**Step 4: Integrate into agent_task_service.py**

In `update_task_status()`, after the broadcast call (around line 51):

```python
    if new_status == AgentTaskStatus.COMPLETED:
        from notifications.services import notify

        notify("agent_task.completed", {"task": task})

    if new_status == AgentTaskStatus.FAILED:
        from notifications.services import notify

        notify("agent_task.failed", {"task": task})
```

**Step 5: Run the full test suite to verify no regressions**

```bash
docker compose exec backend pytest -v
```

**Step 6: Commit**

```
feat(notifications): integrate notify() calls into existing services

- issue_service: notify on assignee change and status change
- issue_service: notify on comment creation and @mentions
- project_service: notify on member added/removed (add actor param)
- artifact_service: notify on artifact created
- agent_task_service: notify on task completed/failed
```

---

### Task 10: Factory and conftest updates

**Files:**
- Modify: `backend/tests/factories.py`
- Modify: `backend/conftest.py`

**Step 1: Add NotificationFactory**

In `backend/tests/factories.py`, add:

```python
from notifications.models import Notification

class NotificationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Notification

    recipient = factory.SubFactory(UserFactory)
    organization = factory.SubFactory(OrganizationFactory)
    event_type = "issue.assigned"
    title = factory.Sequence(lambda n: f"Notification {n}")
    target_type = "issue"
    target_id = factory.LazyFunction(lambda: __import__("uuid").uuid4())
```

**Step 2: Update conftest.py imports**

Add `NotificationFactory` to the imports in `backend/conftest.py` and add the `notification` fixture:

```python
from tests.factories import (
    # ... existing imports ...
    NotificationFactory,
)

@pytest.fixture()
def notification(user, organization):
    return NotificationFactory(recipient=user, organization=organization)
```

Remove the inline `notification` fixture from `test_notifications.py` if it was defined there.

**Step 3: Run all tests**

```bash
docker compose exec backend pytest -v
```

**Step 4: Commit**

```
test(notifications): add NotificationFactory and conftest fixture

- Add NotificationFactory to tests/factories.py
- Add notification fixture to conftest.py
```

---

### Task 11: Frontend — types and API module

**Files:**
- Create: `frontend/types/notifications.ts`
- Modify: `frontend/types/index.ts`
- Modify: `frontend/types/websocket.ts`
- Create: `frontend/lib/api/notifications.ts`
- Modify: `frontend/lib/api/index.ts`

**Step 1: Create notification types**

```typescript
// frontend/types/notifications.ts
import type { User } from "./auth";

export interface NotificationItem {
  id: string;
  event_type: string;
  actor: User | null;
  title: string;
  body: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, string>;
  is_read: boolean;
  read_at: string | null;
  organization: string;
  created_at: string;
}
```

**Step 2: Add notification WebSocket event type**

In `frontend/types/websocket.ts`, add after the SubAgent events:

```typescript
// --- Notification WebSocket Events ---

export interface NotificationCreatedEvent {
  type: "notification.created";
  data: import("./notifications").NotificationItem;
}
```

**Step 3: Re-export from index.ts**

In `frontend/types/index.ts`, add:

```typescript
export type { NotificationItem } from "./notifications";

export type { NotificationCreatedEvent } from "./websocket";
```

**Step 4: Create API module**

```typescript
// frontend/lib/api/notifications.ts
import api from "@/lib/api";
import type { PaginatedResponse, NotificationItem } from "@/types";

export async function listNotifications(params?: {
  cursor?: string;
  is_read?: boolean;
  organization_id?: string;
}): Promise<PaginatedResponse<NotificationItem>> {
  const query: Record<string, string> = {};
  if (params?.cursor) query.cursor = params.cursor;
  if (params?.is_read !== undefined) query.is_read = String(params.is_read);
  if (params?.organization_id) query.organization_id = params.organization_id;
  const { data } = await api.get<PaginatedResponse<NotificationItem>>("/notifications/", { params: query });
  return data;
}

export async function markRead(ids: string[]): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>("/notifications/mark-read/", { ids });
  return data;
}

export async function markAllRead(organizationId?: string): Promise<{ updated: number }> {
  const body: Record<string, string> = {};
  if (organizationId) body.organization_id = organizationId;
  const { data } = await api.post<{ updated: number }>("/notifications/mark-all-read/", body);
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>("/notifications/unread-count/");
  return data.count;
}
```

**Step 5: Re-export from API index**

In `frontend/lib/api/index.ts`, add:

```typescript
export * from "./notifications";
```

Note: Check the exact file `frontend/lib/api/index.ts` — it may not exist. If individual modules are imported directly, skip this step.

**Step 6: Commit**

```
feat(frontend): add notification types and API module

- NotificationItem type with all fields
- NotificationCreatedEvent WebSocket type
- API functions: listNotifications, markRead, markAllRead, getUnreadCount
```

---

### Task 12: Frontend — NotificationProvider context

**Files:**
- Create: `frontend/contexts/notification-context.tsx`
- Create: `frontend/hooks/use-notification-websocket.ts`
- Modify: `frontend/app/(dashboard)/layout.tsx`

**Step 1: Create the notification WebSocket hook**

Follow the pattern from `frontend/hooks/use-project-websocket.ts`:

```typescript
// frontend/hooks/use-notification-websocket.ts
"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { NotificationItem, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseNotificationWebSocketOptions {
  enabled: boolean;
  onNotification: (notification: NotificationItem) => void;
}

export function useNotificationWebSocket({
  enabled,
  onNotification,
}: UseNotificationWebSocketOptions): { readyState: WsReadyState } {
  const url = useMemo(() => {
    if (!enabled) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/notifications/?token=${token}`;
  }, [enabled]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as { type: string; data: NotificationItem };
      if (event?.type === "notification.created" && event.data) {
        onNotification(event.data);
      }
    },
    [onNotification],
  );

  const { readyState } = useWebSocket({
    url,
    onMessage: handleMessage,
  });

  return { readyState };
}
```

**Step 2: Create NotificationProvider**

```typescript
// frontend/contexts/notification-context.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/auth-context";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import type { NotificationItem } from "@/types";
import * as notificationsApi from "@/lib/api/notifications";

const MAX_DROPDOWN_ITEMS = 15;

interface NotificationContextValue {
  unreadCount: number;
  notifications: NotificationItem[];
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const fetchInitial = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [countResult, listResult] = await Promise.all([
        notificationsApi.getUnreadCount(),
        notificationsApi.listNotifications(),
      ]);
      setUnreadCount(countResult);
      setNotifications(listResult.results.slice(0, MAX_DROPDOWN_ITEMS));
    } catch {
      // silently fail
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const handleNewNotification = useCallback((notification: NotificationItem) => {
    setNotifications((prev) => [notification, ...prev].slice(0, MAX_DROPDOWN_ITEMS));
    setUnreadCount((prev) => prev + 1);
  }, []);

  useNotificationWebSocket({
    enabled: isAuthenticated,
    onNotification: handleNewNotification,
  });

  const markAsRead = useCallback(async (ids: string[]) => {
    await notificationsApi.markRead(ids);
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      notifications,
      markAsRead,
      markAllAsRead,
      refreshNotifications: fetchInitial,
    }),
    [unreadCount, notifications, markAsRead, markAllAsRead, fetchInitial],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
```

**Step 3: Add to dashboard layout**

Modify `frontend/app/(dashboard)/layout.tsx` to wrap children with NotificationProvider:

```tsx
"use client";

import { Sidebar } from "@/components/sidebar";
import { NotificationProvider } from "@/contexts/notification-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NotificationProvider>
      <div className="flex min-h-screen bg-slate-950">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden p-6">{children}</main>
      </div>
    </NotificationProvider>
  );
}
```

Note: Wrap the entire layout (including Sidebar) so the Sidebar can access the notification context.

**Step 4: Commit**

```
feat(frontend): add NotificationProvider with WebSocket

- NotificationProvider context with unreadCount and notifications state
- useNotificationWebSocket hook for real-time notification delivery
- Fetches initial unread count and latest notifications on auth
- markAsRead and markAllAsRead with optimistic updates
- Integrated into dashboard layout
```

---

### Task 13: Frontend — Notification dropdown in sidebar

**Files:**
- Create: `frontend/components/notification-dropdown.tsx`
- Modify: `frontend/components/sidebar.tsx`

**Step 1: Create the notification dropdown component**

```tsx
// frontend/components/notification-dropdown.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/contexts/notification-context";
import type { NotificationItem } from "@/types";

function getNotificationUrl(notification: NotificationItem): string {
  switch (notification.target_type) {
    case "issue":
      return `/projects/${notification.metadata.project_id}/issues/${notification.target_id}`;
    case "project":
      return `/projects/${notification.target_id}`;
    case "agent_task":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/tasks";
    case "artifact":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/artifacts";
    default:
      return "/notifications";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationDropdown() {
  const { unreadCount, notifications, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function handleClick(notification: NotificationItem) {
    if (!notification.is_read) {
      markAsRead([notification.id]);
    }
    setOpen(false);
    router.push(getNotificationUrl(notification));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-900/60 hover:text-slate-200"
        title="Notificaciones"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <span className="text-sm font-medium text-white">Notificaciones</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No hay notificaciones
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-700/50 ${
                    !n.is_read ? "bg-slate-750/30" : ""
                  }`}
                >
                  {/* Actor avatar or system icon */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300">
                    {n.actor
                      ? (n.actor.first_name?.[0]?.toUpperCase() || n.actor.email[0].toUpperCase())
                      : "⚡"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${!n.is_read ? "text-white" : "text-slate-300"}`}>
                      {n.title}
                    </p>
                    <span className="text-xs text-slate-500">{timeAgo(n.created_at)}</span>
                  </div>
                  {!n.is_read && (
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-700">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="flex w-full items-center justify-center py-2.5 text-xs text-slate-400 transition-colors hover:text-white"
            >
              Ver todas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add bell to sidebar**

In `frontend/components/sidebar.tsx`, import and add the notification dropdown.

Add import at top:
```typescript
import { NotificationDropdown } from "./notification-dropdown";
```

In the bottom section (the `border-t` div at line ~356), add the bell **before** the user profile link. In the collapsed state, show just the bell icon; in expanded state, show the dropdown.

For the collapsed state (around line 358, inside the collapsed branch):
```tsx
{/* Notifications */}
<div className="mb-2 flex items-center justify-center">
  <NotificationDropdown />
</div>
```

For the expanded state (around line 379, before the profile Link):
```tsx
{/* Notifications */}
<div className="mb-2 flex items-center px-3">
  <NotificationDropdown />
</div>
```

**Step 3: Verify the build**

```bash
cd frontend && ./node_modules/.bin/next build
```

**Step 4: Commit**

```
feat(frontend): add notification bell dropdown in sidebar

- NotificationDropdown component with bell icon + unread badge
- Dropdown shows latest 15 notifications with actor avatar, title, time
- Click navigates to target and marks as read
- Mark all as read button in header
- "Ver todas" footer link to /notifications
- Integrated into sidebar bottom section
```

---

### Task 14: Frontend — Toast component for real-time notifications

**Files:**
- Create: `frontend/components/notification-toast.tsx`
- Modify: `frontend/contexts/notification-context.tsx`

**Step 1: Create toast component**

```tsx
// frontend/components/notification-toast.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationItem } from "@/types";

interface NotificationToastProps {
  notification: NotificationItem;
  onDismiss: () => void;
}

function getNotificationUrl(notification: NotificationItem): string {
  switch (notification.target_type) {
    case "issue":
      return `/projects/${notification.metadata.project_id}/issues/${notification.target_id}`;
    case "project":
      return `/projects/${notification.target_id}`;
    case "agent_task":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/tasks";
    case "artifact":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/artifacts";
    default:
      return "/notifications";
  }
}

export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss after 4 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200); // wait for fade-out
    }, 4000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <button
      onClick={() => {
        router.push(getNotificationUrl(notification));
        onDismiss();
      }}
      className={`w-80 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-xl transition-all duration-200 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs text-indigo-400">
          {notification.actor
            ? (notification.actor.first_name?.[0]?.toUpperCase() || "?")
            : "⚡"}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium text-white leading-snug">{notification.title}</p>
          {notification.body && (
            <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{notification.body}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            setTimeout(onDismiss, 200);
          }}
          className="shrink-0 text-slate-500 hover:text-slate-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </button>
  );
}
```

**Step 2: Add toast container to NotificationProvider**

Update `frontend/contexts/notification-context.tsx` to manage toasts:

Add to state:
```typescript
const [toasts, setToasts] = useState<NotificationItem[]>([]);
```

In `handleNewNotification`, also add to toasts:
```typescript
const handleNewNotification = useCallback((notification: NotificationItem) => {
  setNotifications((prev) => [notification, ...prev].slice(0, MAX_DROPDOWN_ITEMS));
  setUnreadCount((prev) => prev + 1);
  setToasts((prev) => [...prev, notification]);
}, []);
```

Add dismiss function:
```typescript
const dismissToast = useCallback((id: string) => {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}, []);
```

In the returned JSX, render toasts in a fixed container:
```tsx
return (
  <NotificationContext.Provider value={value}>
    {children}
    {/* Toast container */}
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <NotificationToast
          key={t.id}
          notification={t}
          onDismiss={() => dismissToast(t.id)}
        />
      ))}
    </div>
  </NotificationContext.Provider>
);
```

Import: `import { NotificationToast } from "@/components/notification-toast";`

**Step 3: Verify build**

```bash
cd frontend && ./node_modules/.bin/next build
```

**Step 4: Commit**

```
feat(frontend): add real-time notification toasts

- NotificationToast component with fade-in/out animation
- Auto-dismiss after 4 seconds
- Click navigates to target, X button dismisses
- Toast container in NotificationProvider (fixed bottom-right)
```

---

### Task 15: Frontend — Notifications page

**Files:**
- Create: `frontend/app/(dashboard)/notifications/page.tsx`

**Step 1: Create the notifications page**

Follow the pattern from `frontend/app/(dashboard)/labels/page.tsx`:

```tsx
// frontend/app/(dashboard)/notifications/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationItem, PaginatedResponse } from "@/types";
import * as notificationsApi from "@/lib/api/notifications";
import { useNotifications } from "@/contexts/notification-context";

function getNotificationUrl(notification: NotificationItem): string {
  switch (notification.target_type) {
    case "issue":
      return `/projects/${notification.metadata.project_id}/issues/${notification.target_id}`;
    case "project":
      return `/projects/${notification.target_id}`;
    case "agent_task":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/tasks";
    case "artifact":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/artifacts";
    default:
      return "/notifications";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

type FilterStatus = "all" | "unread";

export default function NotificationsPage() {
  const router = useRouter();
  const { markAsRead, markAllAsRead, refreshNotifications } = useNotifications();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchNotifications = useCallback(async (cursor?: string) => {
    try {
      const params: Parameters<typeof notificationsApi.listNotifications>[0] = {};
      if (cursor) params.cursor = cursor;
      if (filter === "unread") params.is_read = false;

      const data = await notificationsApi.listNotifications(params);

      if (cursor) {
        setNotifications((prev) => [...prev, ...data.results]);
      } else {
        setNotifications(data.results);
      }

      // Extract cursor from next URL
      if (data.next) {
        const url = new URL(data.next, window.location.origin);
        setNextCursor(url.searchParams.get("cursor"));
      } else {
        setNextCursor(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setIsLoading(true);
    setSelected(new Set());
    fetchNotifications();
  }, [fetchNotifications]);

  function handleClick(notification: NotificationItem) {
    if (!notification.is_read) {
      markAsRead([notification.id]);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
      );
    }
    router.push(getNotificationUrl(notification));
  }

  async function handleMarkSelectedRead() {
    const ids = Array.from(selected);
    await markAsRead(ids);
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    );
    setSelected(new Set());
    refreshNotifications();
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">Notificaciones</h1>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={handleMarkSelectedRead}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
            >
              Marcar {selected.size} como leídas
            </button>
          )}
          <button
            onClick={handleMarkAllRead}
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            Marcar todas como leídas
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-2">
        {(["all", "unread"] as FilterStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "border border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            {f === "all" ? "Todas" : "No leídas"}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-6">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-500">Cargando...</div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            {filter === "unread" ? "No hay notificaciones sin leer" : "No hay notificaciones"}
          </div>
        ) : (
          <div className="space-y-px rounded-lg border border-slate-800/60 overflow-hidden">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-900/60 ${
                  !n.is_read ? "bg-slate-900/30" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(n.id)}
                  onChange={() => toggleSelected(n.id)}
                  className="h-4 w-4 rounded border-slate-600 bg-transparent text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                />
                <button
                  onClick={() => handleClick(n)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-medium text-slate-300">
                    {n.actor
                      ? (n.actor.first_name?.[0]?.toUpperCase() || n.actor.email[0].toUpperCase())
                      : "⚡"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${!n.is_read ? "font-medium text-white" : "text-slate-300"}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{n.body}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{timeAgo(n.created_at)}</span>
                  {!n.is_read && (
                    <div className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => fetchNotifications(nextCursor)}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
            >
              Cargar más
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && ./node_modules/.bin/next build
```

**Step 3: Commit**

```
feat(frontend): add /notifications page

- Full page listing with cursor pagination
- Filter by all/unread
- Checkbox selection for batch mark-as-read
- Click navigates to target and marks as read
- Load more button for pagination
```

---

### Task 16: Lint, test full suite, final verification

**Step 1: Backend lint**

```bash
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .
```

Fix any issues.

**Step 2: Run all backend tests**

```bash
docker compose exec backend pytest -v
```

All must pass.

**Step 3: Frontend lint and build**

```bash
docker compose exec frontend ./node_modules/.bin/next lint
docker compose exec frontend ./node_modules/.bin/next build
```

Fix any issues.

**Step 4: Commit any fixes**

```
chore: fix lint issues from notification system

- <describe fixes>
```

**Step 5: Final manual verification**

1. Start all services: `make up`
2. Create a user, org, project, issue
3. Assign an issue to another user → verify notification appears
4. Add a comment → verify participants get notified
5. Check the bell icon badge count
6. Open dropdown → verify notifications show
7. Click a notification → verify navigation works
8. Check `/notifications` page → verify listing and filters
9. Mark as read → verify badge decrements
