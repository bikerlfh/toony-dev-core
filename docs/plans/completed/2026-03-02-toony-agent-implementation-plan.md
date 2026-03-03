# ToonyAgent Bot Control Plane V1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to send tasks from the web UI to Claude Code bots (ToonyAgents) running on any machine, with real-time output streaming and interactive approval gates.

**Architecture:** New `toony_agents` Django app with 4 models (ToonyAgent, ToonyAgentKey, AgentTask, TaskEvent), two WebSocket consumers (runner-facing + frontend-facing), REST API, and a standalone Python runner daemon. Frontend gets new pages under `/toony-agents/` with a hybrid dashboard + chat UI.

**Tech Stack:** Django 5 / DRF / Channels (backend), Next.js 15 / React 19 / Tailwind v4 (frontend), Python asyncio + websockets (runner)

**Design doc:** `docs/plans/2026-03-02-toony-agent-bot-control-plane-design.md`

---

## Task 1: Create `toony_agents` Django app + models

**Files:**
- Create: `backend/toony_agents/__init__.py`
- Create: `backend/toony_agents/apps.py`
- Create: `backend/toony_agents/models/__init__.py`
- Create: `backend/toony_agents/models/toony_agent.py`
- Create: `backend/toony_agents/models/toony_agent_key.py`
- Create: `backend/toony_agents/models/agent_task.py`
- Create: `backend/toony_agents/models/task_event.py`
- Modify: `backend/config/settings/base.py:13-36` (add to INSTALLED_APPS)
- Test: `backend/tests/test_toony_agents.py`

**Step 1: Create app directory structure**

```bash
mkdir -p backend/toony_agents/models
mkdir -p backend/toony_agents/services
mkdir -p backend/toony_agents/selectors
mkdir -p backend/toony_agents/serializers
mkdir -p backend/toony_agents/views
```

**Step 2: Create `apps.py`**

```python
# backend/toony_agents/apps.py
from django.apps import AppConfig

class ToonyAgentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "toony_agents"
```

**Step 3: Create `__init__.py`**

```python
# backend/toony_agents/__init__.py
```

**Step 4: Create ToonyAgent model**

```python
# backend/toony_agents/models/toony_agent.py
from django.conf import settings
from django.db import models

from common.models import BaseModel


class ToonyAgentStatus(models.TextChoices):
    OFFLINE = "OFFLINE", "Offline"
    ONLINE = "ONLINE", "Online"
    BUSY = "BUSY", "Busy"


class ToonyAgent(BaseModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=100, unique=True)
    organizations = models.ManyToManyField(
        "organizations.Organization",
        related_name="toony_agents",
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=ToonyAgentStatus.choices,
        default=ToonyAgentStatus.OFFLINE,
    )
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    last_connected_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="registered_toony_agents",
    )

    class Meta:
        db_table = "toony_agents"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"
```

**Step 5: Create ToonyAgentKey model**

```python
# backend/toony_agents/models/toony_agent_key.py
from django.conf import settings
from django.db import models

from common.models import BaseModel


class ToonyAgentKey(BaseModel):
    toony_agent = models.ForeignKey(
        "toony_agents.ToonyAgent",
        on_delete=models.CASCADE,
        related_name="keys",
    )
    key_hash = models.CharField(max_length=128)
    key_prefix = models.CharField(max_length=12)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_toony_agent_keys",
    )

    class Meta:
        db_table = "toony_agent_keys"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.key_prefix}... ({self.name})"
```

**Step 6: Create AgentTask model**

```python
# backend/toony_agents/models/agent_task.py
from django.conf import settings
from django.db import models

from common.models import BaseModel


class AgentTaskStatus(models.TextChoices):
    QUEUED = "QUEUED", "Queued"
    ASSIGNED = "ASSIGNED", "Assigned"
    RUNNING = "RUNNING", "Running"
    AWAITING_APPROVAL = "AWAITING_APPROVAL", "Awaiting Approval"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"


class AgentTask(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="agent_tasks",
    )
    toony_agent = models.ForeignKey(
        "toony_agents.ToonyAgent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    title = models.CharField(max_length=500)
    prompt = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=AgentTaskStatus.choices,
        default=AgentTaskStatus.QUEUED,
    )
    result = models.TextField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_agent_tasks",
    )

    class Meta:
        db_table = "agent_tasks"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["toony_agent", "status"]),
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.status})"
```

**Step 7: Create TaskEvent model**

```python
# backend/toony_agents/models/task_event.py
import uuid

from django.db import models


class TaskEventType(models.TextChoices):
    LOG = "LOG", "Log"
    TOOL_USE = "TOOL_USE", "Tool Use"
    TOOL_RESULT = "TOOL_RESULT", "Tool Result"
    APPROVAL_NEEDED = "APPROVAL_NEEDED", "Approval Needed"
    APPROVAL_RESPONSE = "APPROVAL_RESPONSE", "Approval Response"
    STATUS_CHANGE = "STATUS_CHANGE", "Status Change"
    ERROR = "ERROR", "Error"


class TaskEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(
        "toony_agents.AgentTask",
        on_delete=models.CASCADE,
        related_name="events",
    )
    event_type = models.CharField(
        max_length=20,
        choices=TaskEventType.choices,
    )
    data = models.JSONField(default=dict)
    sequence = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "task_events"
        ordering = ["sequence"]
        indexes = [
            models.Index(fields=["task", "sequence"]),
        ]

    def __str__(self):
        return f"Event #{self.sequence} ({self.event_type})"
```

**Step 8: Create models `__init__.py`**

```python
# backend/toony_agents/models/__init__.py
from .toony_agent import ToonyAgent, ToonyAgentStatus
from .toony_agent_key import ToonyAgentKey
from .agent_task import AgentTask, AgentTaskStatus
from .task_event import TaskEvent, TaskEventType

__all__ = [
    "ToonyAgent",
    "ToonyAgentStatus",
    "ToonyAgentKey",
    "AgentTask",
    "AgentTaskStatus",
    "TaskEvent",
    "TaskEventType",
]
```

**Step 9: Register app in settings**

Add `"toony_agents"` to `INSTALLED_APPS` in `backend/config/settings/base.py` after `"agents"`:

```python
    # Local apps
    "common",
    "accounts",
    "organizations",
    "projects",
    "agents",
    "toony_agents",
    "importers",
```

**Step 10: Generate and run migrations**

Run: `make makemigrations` then `make migrate`

**Step 11: Write model tests**

```python
# backend/tests/test_toony_agents.py
import pytest
from rest_framework import status

from tests.factories import (
    ToonyAgentFactory,
    ToonyAgentKeyFactory,
    AgentTaskFactory,
)

pytestmark = pytest.mark.django_db


class TestToonyAgentModel:
    def test_create_toony_agent(self, user):
        from toony_agents.models import ToonyAgent, ToonyAgentStatus

        agent = ToonyAgent.objects.create(
            name="Test Bot",
            slug="test-bot",
            registered_by=user,
        )
        assert agent.status == ToonyAgentStatus.OFFLINE
        assert agent.metadata == {}
        assert str(agent) == "Test Bot (OFFLINE)"

    def test_toony_agent_organizations_m2m(self, user, organization):
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Multi-Org Bot",
            slug="multi-org-bot",
            registered_by=user,
        )
        agent.organizations.add(organization)
        assert organization in agent.organizations.all()
        assert agent in organization.toony_agents.all()
```

**Step 12: Add factories**

Append to `backend/tests/factories.py`:

```python
from toony_agents.models import (
    ToonyAgent,
    ToonyAgentKey,
    AgentTask,
    AgentTaskStatus,
)

class ToonyAgentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ToonyAgent

    name = factory.Sequence(lambda n: f"Bot {n}")
    slug = factory.Sequence(lambda n: f"bot-{n}")
    registered_by = factory.SubFactory(UserFactory)


class ToonyAgentKeyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ToonyAgentKey

    toony_agent = factory.SubFactory(ToonyAgentFactory)
    key_hash = factory.Sequence(lambda n: f"hash_{n}")
    key_prefix = factory.Sequence(lambda n: f"tok_ta_{n}")
    name = "default"
    created_by = factory.SubFactory(UserFactory)


class AgentTaskFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = AgentTask

    organization = factory.SubFactory(OrganizationFactory)
    toony_agent = factory.SubFactory(ToonyAgentFactory)
    title = factory.Sequence(lambda n: f"Task {n}")
    prompt = "Fix the bug"
    created_by = factory.SubFactory(UserFactory)
```

**Step 13: Run tests**

Run: `docker compose exec backend pytest tests/test_toony_agents.py -v`
Expected: PASS

**Step 14: Commit**

```bash
git add backend/toony_agents/ backend/config/settings/base.py backend/tests/test_toony_agents.py backend/tests/factories.py
git commit -m "feat(toony-agents): add ToonyAgent, ToonyAgentKey, AgentTask, TaskEvent models"
```

---

## Task 2: Backend services + selectors for ToonyAgent and API keys

**Files:**
- Create: `backend/toony_agents/services/__init__.py`
- Create: `backend/toony_agents/services/toony_agent_service.py`
- Create: `backend/toony_agents/services/agent_key_service.py`
- Create: `backend/toony_agents/services/agent_task_service.py`
- Create: `backend/toony_agents/selectors/__init__.py`
- Create: `backend/toony_agents/selectors/toony_agent_selector.py`
- Create: `backend/toony_agents/selectors/agent_task_selector.py`
- Test: `backend/tests/test_toony_agents.py` (extend)

**Step 1: Create ToonyAgent service**

```python
# backend/toony_agents/services/toony_agent_service.py
import hashlib
import secrets

from django.db import transaction

from common.broadcast import broadcast
from toony_agents.models import ToonyAgent, ToonyAgentKey


def create_toony_agent(registered_by, name, slug, **kwargs):
    with transaction.atomic():
        agent = ToonyAgent.objects.create(
            name=name,
            slug=slug,
            registered_by=registered_by,
            **kwargs,
        )
    return agent


def update_toony_agent(toony_agent, **kwargs):
    organization_ids = kwargs.pop("organization_ids", None)
    allowed_fields = {"name", "metadata"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(toony_agent, field, value)
    toony_agent.save()
    if organization_ids is not None:
        toony_agent.organizations.set(organization_ids)
    return toony_agent


def delete_toony_agent(toony_agent):
    toony_agent.delete()


def generate_api_key(toony_agent, created_by, name="default"):
    """Generate a new API key. Returns (ToonyAgentKey, raw_key)."""
    raw_key = f"tok_ta_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:12]

    key = ToonyAgentKey.objects.create(
        toony_agent=toony_agent,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=name,
        created_by=created_by,
    )
    return key, raw_key


def revoke_api_key(key):
    key.is_active = False
    key.save()


def verify_api_key(raw_key):
    """Verify an API key and return the ToonyAgent if valid, else None."""
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    try:
        key = ToonyAgentKey.objects.select_related("toony_agent").get(
            key_hash=key_hash,
            is_active=True,
        )
    except ToonyAgentKey.DoesNotExist:
        return None

    if key.expires_at and key.expires_at < __import__("django").utils.timezone.now():
        return None

    key.last_used_at = __import__("django").utils.timezone.now()
    key.save(update_fields=["last_used_at"])
    return key.toony_agent
```

**Step 2: Create AgentTask service**

```python
# backend/toony_agents/services/agent_task_service.py
from django.db import transaction
from django.utils import timezone

from common.broadcast import broadcast
from toony_agents.models import AgentTask, AgentTaskStatus, TaskEvent, TaskEventType


def create_agent_task(organization, toony_agent, created_by, title, prompt):
    with transaction.atomic():
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=toony_agent,
            title=title,
            prompt=prompt,
            created_by=created_by,
        )
    broadcast(
        f"toony_agent_{toony_agent.id}",
        "task_status",
        {"task_id": str(task.id), "status": task.status},
    )
    return task


def update_task_status(task, new_status, **kwargs):
    task.status = new_status
    if new_status == AgentTaskStatus.RUNNING and not task.started_at:
        task.started_at = timezone.now()
    if new_status in (AgentTaskStatus.COMPLETED, AgentTaskStatus.FAILED, AgentTaskStatus.CANCELLED):
        task.completed_at = timezone.now()
    if "result" in kwargs:
        task.result = kwargs["result"]
    if "error" in kwargs:
        task.error = kwargs["error"]
    task.save()

    broadcast(
        f"toony_agent_{task.toony_agent_id}",
        "task_status",
        {"task_id": str(task.id), "status": task.status},
    )
    return task


def create_task_event(task, event_type, data, sequence):
    event = TaskEvent.objects.create(
        task=task,
        event_type=event_type,
        data=data,
        sequence=sequence,
    )
    broadcast(
        f"toony_agent_{task.toony_agent_id}",
        "task_event",
        {
            "task_id": str(task.id),
            "event_type": event_type,
            "data": data,
            "sequence": sequence,
        },
    )
    return event
```

**Step 3: Create selectors**

```python
# backend/toony_agents/selectors/toony_agent_selector.py
from toony_agents.models import ToonyAgent, ToonyAgentKey


def list_toony_agents_for_organization(organization):
    return ToonyAgent.objects.filter(
        organizations=organization,
    ).prefetch_related("organizations")


def get_toony_agent_by_slug(slug):
    return ToonyAgent.objects.filter(slug=slug).first()


def get_toony_agent_by_id(agent_id):
    return ToonyAgent.objects.filter(id=agent_id).first()


def list_agent_keys(toony_agent):
    return ToonyAgentKey.objects.filter(
        toony_agent=toony_agent,
    ).select_related("created_by")
```

```python
# backend/toony_agents/selectors/agent_task_selector.py
from toony_agents.models import AgentTask, TaskEvent


def list_tasks_for_agent(toony_agent, *, organization=None):
    qs = AgentTask.objects.filter(toony_agent=toony_agent)
    if organization:
        qs = qs.filter(organization=organization)
    return qs.select_related("toony_agent", "created_by")


def get_task_by_id(task_id):
    return AgentTask.objects.filter(
        id=task_id,
    ).select_related("toony_agent", "created_by").first()


def list_task_events(task, *, after_sequence=None):
    qs = TaskEvent.objects.filter(task=task)
    if after_sequence is not None:
        qs = qs.filter(sequence__gt=after_sequence)
    return qs.order_by("sequence")
```

**Step 4: Create selector and service `__init__.py` files**

```python
# backend/toony_agents/selectors/__init__.py
from .toony_agent_selector import *  # noqa
from .agent_task_selector import *  # noqa
```

```python
# backend/toony_agents/services/__init__.py
from .toony_agent_service import *  # noqa
from .agent_task_service import *  # noqa
```

**Step 5: Write service tests**

Add to `backend/tests/test_toony_agents.py`:

```python
class TestToonyAgentService:
    def test_generate_api_key(self, user):
        from toony_agents.services import generate_api_key, verify_api_key
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot", slug="svc-bot", registered_by=user,
        )
        key_obj, raw_key = generate_api_key(agent, user, name="test-key")
        assert raw_key.startswith("tok_ta_")
        assert key_obj.key_prefix == raw_key[:12]

        # Verify returns agent
        verified = verify_api_key(raw_key)
        assert verified == agent

        # Wrong key returns None
        assert verify_api_key("tok_ta_invalid") is None

    def test_revoke_api_key(self, user):
        from toony_agents.services import generate_api_key, revoke_api_key, verify_api_key
        from toony_agents.models import ToonyAgent

        agent = ToonyAgent.objects.create(
            name="Bot", slug="revoke-bot", registered_by=user,
        )
        key_obj, raw_key = generate_api_key(agent, user)
        revoke_api_key(key_obj)
        assert verify_api_key(raw_key) is None


class TestAgentTaskService:
    def test_create_task(self, user, organization):
        from toony_agents.services import create_agent_task
        from toony_agents.models import ToonyAgent, AgentTaskStatus

        agent = ToonyAgent.objects.create(
            name="Bot", slug="task-bot", registered_by=user,
        )
        task = create_agent_task(
            organization=organization,
            toony_agent=agent,
            created_by=user,
            title="Fix bug",
            prompt="Fix the login bug",
        )
        assert task.status == AgentTaskStatus.QUEUED
        assert task.toony_agent == agent

    def test_update_task_status(self, user, organization):
        from toony_agents.services import create_agent_task, update_task_status
        from toony_agents.models import ToonyAgent, AgentTaskStatus

        agent = ToonyAgent.objects.create(
            name="Bot", slug="status-bot", registered_by=user,
        )
        task = create_agent_task(
            organization=organization,
            toony_agent=agent,
            created_by=user,
            title="Task",
            prompt="Do something",
        )
        task = update_task_status(task, AgentTaskStatus.RUNNING)
        assert task.status == AgentTaskStatus.RUNNING
        assert task.started_at is not None
```

**Step 6: Run tests**

Run: `docker compose exec backend pytest tests/test_toony_agents.py -v`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/toony_agents/services/ backend/toony_agents/selectors/ backend/tests/test_toony_agents.py
git commit -m "feat(toony-agents): add services and selectors for ToonyAgent, API keys, and tasks"
```

---

## Task 3: Backend REST API (serializers, views, URLs, permissions)

**Files:**
- Create: `backend/toony_agents/serializers/__init__.py`
- Create: `backend/toony_agents/serializers/input.py`
- Create: `backend/toony_agents/serializers/output.py`
- Create: `backend/toony_agents/views/__init__.py`
- Create: `backend/toony_agents/views/toony_agent_views.py`
- Create: `backend/toony_agents/views/agent_task_views.py`
- Create: `backend/toony_agents/permissions.py`
- Create: `backend/toony_agents/urls.py`
- Modify: `backend/config/urls.py` (add URL include)
- Test: `backend/tests/test_toony_agents.py` (extend with API tests)

**Step 1: Create input serializers**

```python
# backend/toony_agents/serializers/input.py
from rest_framework import serializers


class CreateToonyAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=100)
    metadata = serializers.JSONField(required=False, default=dict)


class UpdateToonyAgentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    metadata = serializers.JSONField(required=False)
    organization_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False,
    )


class GenerateKeySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, default="default")


class CreateAgentTaskSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500)
    prompt = serializers.CharField()
    toony_agent_slug = serializers.SlugField()
```

**Step 2: Create output serializers**

```python
# backend/toony_agents/serializers/output.py
from rest_framework import serializers

from toony_agents.models import ToonyAgent, ToonyAgentKey, AgentTask, TaskEvent


class ToonyAgentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToonyAgent
        fields = [
            "id", "name", "slug", "status",
            "last_heartbeat", "last_connected_at",
            "metadata", "created_at",
        ]
        read_only_fields = fields


class ToonyAgentDetailSerializer(serializers.ModelSerializer):
    registered_by = serializers.SerializerMethodField()

    class Meta:
        model = ToonyAgent
        fields = [
            "id", "name", "slug", "status",
            "last_heartbeat", "last_connected_at",
            "metadata", "registered_by",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_registered_by(self, obj):
        u = obj.registered_by
        return {
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
        }


class ToonyAgentKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = ToonyAgentKey
        fields = [
            "id", "key_prefix", "name", "is_active",
            "last_used_at", "expires_at", "created_at",
        ]
        read_only_fields = fields


class AgentTaskListSerializer(serializers.ModelSerializer):
    toony_agent_slug = serializers.CharField(source="toony_agent.slug", default=None)

    class Meta:
        model = AgentTask
        fields = [
            "id", "title", "status", "toony_agent_slug",
            "started_at", "completed_at", "created_at",
        ]
        read_only_fields = fields


class AgentTaskDetailSerializer(serializers.ModelSerializer):
    toony_agent_slug = serializers.CharField(source="toony_agent.slug", default=None)
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = AgentTask
        fields = [
            "id", "title", "prompt", "status",
            "toony_agent_slug", "result", "error",
            "started_at", "completed_at",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_created_by(self, obj):
        u = obj.created_by
        return {
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
        }


class TaskEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskEvent
        fields = ["id", "event_type", "data", "sequence", "created_at"]
        read_only_fields = fields
```

**Step 3: Create serializers `__init__.py`**

```python
# backend/toony_agents/serializers/__init__.py
```

**Step 4: Create permissions**

```python
# backend/toony_agents/permissions.py
from rest_framework.permissions import BasePermission

from organizations.permissions import get_membership


class IsToonyAgentOrgMember(BasePermission):
    """Require org membership. Resolves org + membership onto request."""

    def has_permission(self, request, view):
        org_slug = view.kwargs.get("org_slug")
        if not org_slug:
            return False
        membership = get_membership(request.user, org_slug)
        if membership is None:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True
```

**Step 5: Create ToonyAgent views**

```python
# backend/toony_agents/views/toony_agent_views.py
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from toony_agents.permissions import IsToonyAgentOrgMember
from toony_agents.selectors import (
    get_toony_agent_by_slug,
    list_agent_keys,
    list_toony_agents_for_organization,
)
from toony_agents.serializers.input import (
    CreateToonyAgentSerializer,
    GenerateKeySerializer,
    UpdateToonyAgentSerializer,
)
from toony_agents.serializers.output import (
    ToonyAgentDetailSerializer,
    ToonyAgentKeySerializer,
    ToonyAgentListSerializer,
)
from toony_agents.services import (
    create_toony_agent,
    delete_toony_agent,
    generate_api_key,
    revoke_api_key,
    update_toony_agent,
)


class ToonyAgentListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, org_slug):
        agents = list_toony_agents_for_organization(request.organization)
        return self.paginate(agents, ToonyAgentListSerializer, request)

    def post(self, request, org_slug):
        serializer = CreateToonyAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        agent = create_toony_agent(
            registered_by=request.user,
            **serializer.validated_data,
        )
        agent.organizations.add(request.organization)
        output = ToonyAgentDetailSerializer(agent).data
        return Response(output, status=status.HTTP_201_CREATED)


class ToonyAgentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def _get_agent(self, organization, slug):
        agent = get_toony_agent_by_slug(slug)
        if agent is None or not agent.organizations.filter(id=organization.id).exists():
            raise NotFound("ToonyAgent not found.")
        return agent

    def get(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        output = ToonyAgentDetailSerializer(agent).data
        return Response(output)

    def put(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        serializer = UpdateToonyAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        agent = update_toony_agent(agent, **serializer.validated_data)
        output = ToonyAgentDetailSerializer(agent).data
        return Response(output)

    def delete(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        delete_toony_agent(agent)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ToonyAgentKeyListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def _get_agent(self, organization, slug):
        agent = get_toony_agent_by_slug(slug)
        if agent is None or not agent.organizations.filter(id=organization.id).exists():
            raise NotFound("ToonyAgent not found.")
        return agent

    def get(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        keys = list_agent_keys(agent)
        return self.paginate(keys, ToonyAgentKeySerializer, request)

    def post(self, request, org_slug, agent_slug):
        agent = self._get_agent(request.organization, agent_slug)
        serializer = GenerateKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key_obj, raw_key = generate_api_key(
            agent, request.user, name=serializer.validated_data["name"],
        )
        output = ToonyAgentKeySerializer(key_obj).data
        output["raw_key"] = raw_key  # Shown once
        return Response(output, status=status.HTTP_201_CREATED)


class ToonyAgentKeyRevokeView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def delete(self, request, org_slug, agent_slug, key_id):
        agent = get_toony_agent_by_slug(agent_slug)
        if agent is None or not agent.organizations.filter(id=request.organization.id).exists():
            raise NotFound("ToonyAgent not found.")
        try:
            key = agent.keys.get(id=key_id)
        except Exception:
            raise NotFound("Key not found.")
        revoke_api_key(key)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 6: Create AgentTask views**

```python
# backend/toony_agents/views/agent_task_views.py
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from toony_agents.permissions import IsToonyAgentOrgMember
from toony_agents.selectors import (
    get_task_by_id,
    get_toony_agent_by_slug,
    list_task_events,
    list_tasks_for_agent,
)
from toony_agents.serializers.input import CreateAgentTaskSerializer
from toony_agents.serializers.output import (
    AgentTaskDetailSerializer,
    AgentTaskListSerializer,
    TaskEventSerializer,
)
from toony_agents.services import create_agent_task, update_task_status
from toony_agents.models import AgentTaskStatus


class AgentTaskListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, org_slug, agent_slug):
        agent = get_toony_agent_by_slug(agent_slug)
        if agent is None or not agent.organizations.filter(id=request.organization.id).exists():
            raise NotFound("ToonyAgent not found.")
        tasks = list_tasks_for_agent(agent, organization=request.organization)
        return self.paginate(tasks, AgentTaskListSerializer, request)

    def post(self, request, org_slug, agent_slug):
        agent = get_toony_agent_by_slug(agent_slug)
        if agent is None or not agent.organizations.filter(id=request.organization.id).exists():
            raise NotFound("ToonyAgent not found.")
        serializer = CreateAgentTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("toony_agent_slug", None)
        task = create_agent_task(
            organization=request.organization,
            toony_agent=agent,
            created_by=request.user,
            **data,
        )
        output = AgentTaskDetailSerializer(task).data
        return Response(output, status=status.HTTP_201_CREATED)


class AgentTaskDetailView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, org_slug, agent_slug, task_id):
        task = get_task_by_id(task_id)
        if task is None or task.organization_id != request.organization.id:
            raise NotFound("Task not found.")
        output = AgentTaskDetailSerializer(task).data
        return Response(output)


class AgentTaskCancelView(APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def post(self, request, org_slug, agent_slug, task_id):
        task = get_task_by_id(task_id)
        if task is None or task.organization_id != request.organization.id:
            raise NotFound("Task not found.")
        if task.status in (AgentTaskStatus.COMPLETED, AgentTaskStatus.FAILED, AgentTaskStatus.CANCELLED):
            return Response({"detail": "Task already finished."}, status=status.HTTP_400_BAD_REQUEST)
        task = update_task_status(task, AgentTaskStatus.CANCELLED)
        output = AgentTaskDetailSerializer(task).data
        return Response(output)


class TaskEventListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, org_slug, agent_slug, task_id):
        task = get_task_by_id(task_id)
        if task is None or task.organization_id != request.organization.id:
            raise NotFound("Task not found.")
        after = request.query_params.get("after_sequence")
        after_seq = int(after) if after else None
        events = list_task_events(task, after_sequence=after_seq)
        return self.paginate(events, TaskEventSerializer, request)
```

**Step 7: Create views `__init__.py`**

```python
# backend/toony_agents/views/__init__.py
```

**Step 8: Create URLs**

```python
# backend/toony_agents/urls.py
from django.urls import path

from toony_agents.views.toony_agent_views import (
    ToonyAgentDetailView,
    ToonyAgentKeyListCreateView,
    ToonyAgentKeyRevokeView,
    ToonyAgentListCreateView,
)
from toony_agents.views.agent_task_views import (
    AgentTaskDetailView,
    AgentTaskListCreateView,
    AgentTaskCancelView,
    TaskEventListView,
)

urlpatterns = [
    path(
        "toony-agents/",
        ToonyAgentListCreateView.as_view(),
        name="toony-agent-list-create",
    ),
    path(
        "toony-agents/<slug:agent_slug>/",
        ToonyAgentDetailView.as_view(),
        name="toony-agent-detail",
    ),
    path(
        "toony-agents/<slug:agent_slug>/keys/",
        ToonyAgentKeyListCreateView.as_view(),
        name="toony-agent-key-list-create",
    ),
    path(
        "toony-agents/<slug:agent_slug>/keys/<uuid:key_id>/",
        ToonyAgentKeyRevokeView.as_view(),
        name="toony-agent-key-revoke",
    ),
    path(
        "toony-agents/<slug:agent_slug>/tasks/",
        AgentTaskListCreateView.as_view(),
        name="agent-task-list-create",
    ),
    path(
        "toony-agents/<slug:agent_slug>/tasks/<uuid:task_id>/",
        AgentTaskDetailView.as_view(),
        name="agent-task-detail",
    ),
    path(
        "toony-agents/<slug:agent_slug>/tasks/<uuid:task_id>/cancel/",
        AgentTaskCancelView.as_view(),
        name="agent-task-cancel",
    ),
    path(
        "toony-agents/<slug:agent_slug>/tasks/<uuid:task_id>/events/",
        TaskEventListView.as_view(),
        name="task-event-list",
    ),
]
```

**Step 9: Register URLs in config**

Add to `backend/config/urls.py`:

```python
path("api/v1/organizations/<slug:org_slug>/", include("toony_agents.urls")),
```

**Step 10: Write API tests**

Add to `backend/tests/test_toony_agents.py`:

```python
def toony_agents_url(org_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/"


def toony_agent_url(org_slug, agent_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/{agent_slug}/"


def keys_url(org_slug, agent_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/{agent_slug}/keys/"


def tasks_url(org_slug, agent_slug):
    return f"/api/v1/organizations/{org_slug}/toony-agents/{agent_slug}/tasks/"


class TestToonyAgentAPI:
    def test_create_toony_agent(self, authenticated_client, organization):
        url = toony_agents_url(organization.slug)
        data = {"name": "My Bot", "slug": "my-bot"}
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Bot"
        assert response.data["slug"] == "my-bot"

    def test_list_toony_agents(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(
            name="Bot", slug="list-bot", registered_by=user,
        )
        agent.organizations.add(organization)
        url = toony_agents_url(organization.slug)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_generate_api_key(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(
            name="Bot", slug="key-bot", registered_by=user,
        )
        agent.organizations.add(organization)
        url = keys_url(organization.slug, "key-bot")
        response = authenticated_client.post(url, {"name": "dev"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "raw_key" in response.data
        assert response.data["raw_key"].startswith("tok_ta_")

    def test_create_task(self, authenticated_client, organization, user):
        from toony_agents.models import ToonyAgent
        agent = ToonyAgent.objects.create(
            name="Bot", slug="task-api-bot", registered_by=user,
        )
        agent.organizations.add(organization)
        url = tasks_url(organization.slug, "task-api-bot")
        data = {
            "title": "Fix bug",
            "prompt": "Fix the login bug",
            "toony_agent_slug": "task-api-bot",
        }
        response = authenticated_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "QUEUED"

    def test_unauthenticated(self, api_client, organization):
        url = toony_agents_url(organization.slug)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
```

**Step 11: Run tests**

Run: `docker compose exec backend pytest tests/test_toony_agents.py -v`
Expected: PASS

**Step 12: Commit**

```bash
git add backend/toony_agents/serializers/ backend/toony_agents/views/ backend/toony_agents/permissions.py backend/toony_agents/urls.py backend/config/urls.py backend/tests/test_toony_agents.py
git commit -m "feat(toony-agents): add REST API for ToonyAgent, API keys, and tasks"
```

---

## Task 4: Backend WebSocket consumers (runner-facing + frontend-facing)

**Files:**
- Create: `backend/toony_agents/consumers.py`
- Create: `backend/toony_agents/routing.py`
- Modify: `backend/config/routing.py` (register new WS routes)

**Step 1: Create consumers**

```python
# backend/toony_agents/consumers.py
import hashlib

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from accounts.models import OrganizationMembership
from toony_agents.models import (
    AgentTask,
    AgentTaskStatus,
    TaskEvent,
    TaskEventType,
    ToonyAgent,
    ToonyAgentKey,
    ToonyAgentStatus,
)


# ── Async DB helpers ──────────────────────────────────

@database_sync_to_async
def _verify_api_key(raw_key):
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    try:
        key = ToonyAgentKey.objects.select_related("toony_agent").get(
            key_hash=key_hash, is_active=True,
        )
    except ToonyAgentKey.DoesNotExist:
        return None
    if key.expires_at and key.expires_at < timezone.now():
        return None
    key.last_used_at = timezone.now()
    key.save(update_fields=["last_used_at"])
    return key.toony_agent


@database_sync_to_async
def _set_agent_status(agent_id, agent_status, **kwargs):
    updates = {"status": agent_status}
    if kwargs.get("last_connected_at"):
        updates["last_connected_at"] = timezone.now()
    if kwargs.get("last_heartbeat"):
        updates["last_heartbeat"] = timezone.now()
    if kwargs.get("metadata"):
        updates["metadata"] = kwargs["metadata"]
    ToonyAgent.objects.filter(id=agent_id).update(**updates)


@database_sync_to_async
def _update_task_status(task_id, new_status, **kwargs):
    updates = {"status": new_status}
    if new_status == AgentTaskStatus.RUNNING:
        updates["started_at"] = timezone.now()
    if new_status in (AgentTaskStatus.COMPLETED, AgentTaskStatus.FAILED, AgentTaskStatus.CANCELLED):
        updates["completed_at"] = timezone.now()
    if "result" in kwargs:
        updates["result"] = kwargs["result"]
    if "error" in kwargs:
        updates["error"] = kwargs["error"]
    AgentTask.objects.filter(id=task_id).update(**updates)


@database_sync_to_async
def _create_task_event(task_id, event_type, data, sequence):
    return TaskEvent.objects.create(
        task_id=task_id,
        event_type=event_type,
        data=data,
        sequence=sequence,
    )


@database_sync_to_async
def _get_queued_tasks(agent_id):
    return list(
        AgentTask.objects.filter(
            toony_agent_id=agent_id,
            status=AgentTaskStatus.QUEUED,
        ).values("id", "title", "prompt")
    )


@database_sync_to_async
def _is_org_member(user, agent_id):
    org_ids = list(
        ToonyAgent.objects.filter(id=agent_id).values_list(
            "organizations__id", flat=True,
        )
    )
    return OrganizationMembership.objects.filter(
        user=user, organization_id__in=org_ids, is_active=True,
    ).exists()


# ── Runner-facing consumer ────────────────────────────

class ToonyAgentRunnerConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket for the toony_agent_runner daemon. Auth via API key."""

    async def connect(self):
        query_string = self.scope.get("query_string", b"").decode()
        params = dict(p.split("=", 1) for p in query_string.split("&") if "=" in p)
        raw_key = params.get("key", "")

        self.toony_agent = await _verify_api_key(raw_key)
        if self.toony_agent is None:
            await self.close(code=4001)
            return

        self.agent_id = str(self.toony_agent.id)
        self.runner_group = f"toony_agent_runner_{self.agent_id}"
        self.frontend_group = f"toony_agent_{self.agent_id}"

        await self.channel_layer.group_add(self.runner_group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "agent_id"):
            await _set_agent_status(self.agent_id, ToonyAgentStatus.OFFLINE)
            await self.channel_layer.group_discard(self.runner_group, self.channel_name)
            # Notify frontend
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "agent_status", "data": {"status": "OFFLINE"}},
            )

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "register":
            metadata = content.get("metadata", {})
            await _set_agent_status(
                self.agent_id, ToonyAgentStatus.ONLINE,
                last_connected_at=True, metadata=metadata,
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "agent_status", "data": {"status": "ONLINE", "metadata": metadata}},
            )
            # Send any queued tasks
            queued = await _get_queued_tasks(self.agent_id)
            for task in queued:
                await self.send_json({
                    "type": "task.assign",
                    "task_id": str(task["id"]),
                    "prompt": task["prompt"],
                    "title": task["title"],
                })

        elif msg_type == "heartbeat":
            await _set_agent_status(self.agent_id, None, last_heartbeat=True)
            await self.send_json({"type": "heartbeat.ack"})

        elif msg_type == "task.accepted":
            task_id = content.get("task_id")
            await _update_task_status(task_id, AgentTaskStatus.ASSIGNED)
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "task_status", "data": {"task_id": task_id, "status": "ASSIGNED"}},
            )

        elif msg_type == "task.event":
            task_id = content.get("task_id")
            event_type = content.get("event_type", TaskEventType.LOG)
            data = content.get("data", {})
            sequence = content.get("sequence", 0)
            await _create_task_event(task_id, event_type, data, sequence)
            # If first event, mark as running
            if sequence == 1:
                await _update_task_status(task_id, AgentTaskStatus.RUNNING)
                await _set_agent_status(self.agent_id, ToonyAgentStatus.BUSY)
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "task_event",
                    "data": {
                        "task_id": task_id,
                        "event_type": event_type,
                        "data": data,
                        "sequence": sequence,
                    },
                },
            )

        elif msg_type == "approval.needed":
            task_id = content.get("task_id")
            data = content.get("data", {})
            sequence = content.get("sequence", 0)
            await _update_task_status(task_id, AgentTaskStatus.AWAITING_APPROVAL)
            await _create_task_event(task_id, TaskEventType.APPROVAL_NEEDED, data, sequence)
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "approval_needed",
                    "data": {"task_id": task_id, "data": data, "sequence": sequence},
                },
            )

        elif msg_type == "task.completed":
            task_id = content.get("task_id")
            result = content.get("result", "")
            await _update_task_status(task_id, AgentTaskStatus.COMPLETED, result=result)
            await _set_agent_status(self.agent_id, ToonyAgentStatus.ONLINE)
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "task_status", "data": {"task_id": task_id, "status": "COMPLETED"}},
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "agent_status", "data": {"status": "ONLINE"}},
            )

        elif msg_type == "task.failed":
            task_id = content.get("task_id")
            error = content.get("error", "")
            await _update_task_status(task_id, AgentTaskStatus.FAILED, error=error)
            await _set_agent_status(self.agent_id, ToonyAgentStatus.ONLINE)
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "task_status", "data": {"task_id": task_id, "status": "FAILED", "error": error}},
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "agent_status", "data": {"status": "ONLINE"}},
            )

    # Group handlers (receive from frontend consumer via backend)
    async def approval_response(self, event):
        await self.send_json({
            "type": "approval.response",
            "task_id": event["data"]["task_id"],
            "action": event["data"]["action"],
            "response": event["data"]["response"],
        })

    async def task_cancel(self, event):
        await self.send_json({
            "type": "task.cancel",
            "task_id": event["data"]["task_id"],
        })

    async def task_assign(self, event):
        await self.send_json({
            "type": "task.assign",
            "task_id": event["data"]["task_id"],
            "prompt": event["data"]["prompt"],
            "title": event["data"]["title"],
        })


# ── Frontend-facing consumer ──────────────────────────

class ToonyAgentConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket for the frontend UI. Auth via JWT (existing pattern)."""

    async def connect(self):
        self.agent_id = str(self.scope["url_route"]["kwargs"]["agent_id"])
        self.group_name = f"toony_agent_{self.agent_id}"
        user = self.scope.get("user")

        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        if not await _is_org_member(user, self.agent_id):
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")
        runner_group = f"toony_agent_runner_{self.agent_id}"

        if msg_type == "approval.response":
            task_id = content.get("task_id")
            action = content.get("action", "approve")
            response = content.get("response", "")
            await _create_task_event(
                task_id, TaskEventType.APPROVAL_RESPONSE,
                {"action": action, "response": response},
                content.get("sequence", 0),
            )
            if action == "reject":
                await _update_task_status(task_id, AgentTaskStatus.CANCELLED)
            else:
                await _update_task_status(task_id, AgentTaskStatus.RUNNING)
            await self.channel_layer.group_send(
                runner_group,
                {
                    "type": "approval_response",
                    "data": {"task_id": task_id, "action": action, "response": response},
                },
            )

        elif msg_type == "task.cancel":
            task_id = content.get("task_id")
            await _update_task_status(task_id, AgentTaskStatus.CANCELLED)
            await self.channel_layer.group_send(
                runner_group,
                {"type": "task_cancel", "data": {"task_id": task_id}},
            )

    # Group handlers (receive broadcasts)
    async def agent_status(self, event):
        await self.send_json({"type": "agent.status", **event["data"]})

    async def task_status(self, event):
        await self.send_json({"type": "task.status", **event["data"]})

    async def task_event(self, event):
        await self.send_json({"type": "task.event", **event["data"]})

    async def approval_needed(self, event):
        await self.send_json({"type": "approval.needed", **event["data"]})
```

**Step 2: Create routing**

```python
# backend/toony_agents/routing.py
from django.urls import path

from toony_agents.consumers import ToonyAgentConsumer, ToonyAgentRunnerConsumer

websocket_urlpatterns = [
    path("ws/toony-agents/<uuid:agent_id>/", ToonyAgentConsumer.as_asgi()),
    path("ws/toony-agents/runner/", ToonyAgentRunnerConsumer.as_asgi()),
]
```

**Step 3: Register in config routing**

Modify `backend/config/routing.py`:

```python
from agents.routing import websocket_urlpatterns as agent_ws
from projects.routing import websocket_urlpatterns as project_ws
from toony_agents.routing import websocket_urlpatterns as toony_agent_ws

websocket_urlpatterns = project_ws + agent_ws + toony_agent_ws
```

**Step 4: Commit**

```bash
git add backend/toony_agents/consumers.py backend/toony_agents/routing.py backend/config/routing.py
git commit -m "feat(toony-agents): add WebSocket consumers for runner and frontend"
```

---

## Task 5: Frontend types, API module, and WebSocket hook

**Files:**
- Create: `frontend/types/toony-agents.ts`
- Modify: `frontend/types/index.ts` (add re-exports)
- Create: `frontend/lib/api/toony-agents.ts`
- Modify: `frontend/lib/api/index.ts` (add re-export)
- Create: `frontend/hooks/use-toony-agent-websocket.ts`

**Step 1: Create types**

```typescript
// frontend/types/toony-agents.ts
export type ToonyAgentStatus = "OFFLINE" | "ONLINE" | "BUSY";
export type AgentTaskStatus =
  | "QUEUED"
  | "ASSIGNED"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
export type TaskEventType =
  | "LOG"
  | "TOOL_USE"
  | "TOOL_RESULT"
  | "APPROVAL_NEEDED"
  | "APPROVAL_RESPONSE"
  | "STATUS_CHANGE"
  | "ERROR";

export interface ToonyAgentList {
  id: string;
  name: string;
  slug: string;
  status: ToonyAgentStatus;
  last_heartbeat: string | null;
  last_connected_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ToonyAgentDetail extends ToonyAgentList {
  registered_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  updated_at: string;
}

export interface CreateToonyAgentPayload {
  name: string;
  slug: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateToonyAgentPayload {
  name?: string;
  metadata?: Record<string, unknown>;
  organization_ids?: string[];
}

export interface ToonyAgentKeyItem {
  id: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  raw_key?: string; // Only on creation response
}

export interface AgentTaskList {
  id: string;
  title: string;
  status: AgentTaskStatus;
  toony_agent_slug: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AgentTaskDetail extends AgentTaskList {
  prompt: string;
  result: string | null;
  error: string | null;
  created_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  updated_at: string;
}

export interface CreateAgentTaskPayload {
  title: string;
  prompt: string;
  toony_agent_slug: string;
}

export interface TaskEventItem {
  id: string;
  event_type: TaskEventType;
  data: Record<string, unknown>;
  sequence: number;
  created_at: string;
}

// WebSocket event types
export interface ToonyAgentStatusWsEvent {
  type: "agent.status";
  status: ToonyAgentStatus;
  metadata?: Record<string, unknown>;
}

export interface TaskStatusWsEvent {
  type: "task.status";
  task_id: string;
  status: AgentTaskStatus;
  error?: string;
}

export interface TaskEventWsEvent {
  type: "task.event";
  task_id: string;
  event_type: TaskEventType;
  data: Record<string, unknown>;
  sequence: number;
}

export interface ApprovalNeededWsEvent {
  type: "approval.needed";
  task_id: string;
  data: {
    stage?: string;
    question: string;
    options?: { label: string; description: string }[];
  };
  sequence: number;
}

export type ToonyAgentWsEvent =
  | ToonyAgentStatusWsEvent
  | TaskStatusWsEvent
  | TaskEventWsEvent
  | ApprovalNeededWsEvent;
```

**Step 2: Add re-exports to `frontend/types/index.ts`**

Append before the pagination section:

```typescript
export type {
  ToonyAgentStatus,
  AgentTaskStatus,
  TaskEventType,
  ToonyAgentList,
  ToonyAgentDetail,
  CreateToonyAgentPayload,
  UpdateToonyAgentPayload,
  ToonyAgentKeyItem,
  AgentTaskList,
  AgentTaskDetail,
  CreateAgentTaskPayload,
  TaskEventItem,
  ToonyAgentStatusWsEvent,
  TaskStatusWsEvent,
  TaskEventWsEvent,
  ApprovalNeededWsEvent,
  ToonyAgentWsEvent,
} from "./toony-agents";
```

**Step 3: Create API module**

```typescript
// frontend/lib/api/toony-agents.ts
import api from "@/lib/api";
import type {
  ToonyAgentList,
  ToonyAgentDetail,
  CreateToonyAgentPayload,
  UpdateToonyAgentPayload,
  ToonyAgentKeyItem,
  AgentTaskList,
  AgentTaskDetail,
  CreateAgentTaskPayload,
  TaskEventItem,
  PaginatedResponse,
} from "@/types";

// ── ToonyAgent CRUD ──

export async function listToonyAgents(
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ToonyAgentList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ToonyAgentList>>(
    `/organizations/${orgSlug}/toony-agents/`,
    { params }
  );
  return data;
}

export async function createToonyAgent(
  orgSlug: string,
  payload: CreateToonyAgentPayload
): Promise<ToonyAgentDetail> {
  const { data } = await api.post<ToonyAgentDetail>(
    `/organizations/${orgSlug}/toony-agents/`,
    payload
  );
  return data;
}

export async function getToonyAgent(
  orgSlug: string,
  agentSlug: string
): Promise<ToonyAgentDetail> {
  const { data } = await api.get<ToonyAgentDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/`
  );
  return data;
}

export async function updateToonyAgent(
  orgSlug: string,
  agentSlug: string,
  payload: UpdateToonyAgentPayload
): Promise<ToonyAgentDetail> {
  const { data } = await api.put<ToonyAgentDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/`,
    payload
  );
  return data;
}

export async function deleteToonyAgent(
  orgSlug: string,
  agentSlug: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/toony-agents/${agentSlug}/`);
}

// ── API Keys ──

export async function listAgentKeys(
  orgSlug: string,
  agentSlug: string
): Promise<PaginatedResponse<ToonyAgentKeyItem>> {
  const { data } = await api.get<PaginatedResponse<ToonyAgentKeyItem>>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/keys/`
  );
  return data;
}

export async function generateAgentKey(
  orgSlug: string,
  agentSlug: string,
  name: string
): Promise<ToonyAgentKeyItem> {
  const { data } = await api.post<ToonyAgentKeyItem>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/keys/`,
    { name }
  );
  return data;
}

export async function revokeAgentKey(
  orgSlug: string,
  agentSlug: string,
  keyId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/keys/${keyId}/`
  );
}

// ── Tasks ──

export async function listAgentTasks(
  orgSlug: string,
  agentSlug: string,
  cursor?: string
): Promise<PaginatedResponse<AgentTaskList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<AgentTaskList>>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/`,
    { params }
  );
  return data;
}

export async function createAgentTask(
  orgSlug: string,
  agentSlug: string,
  payload: CreateAgentTaskPayload
): Promise<AgentTaskDetail> {
  const { data } = await api.post<AgentTaskDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/`,
    payload
  );
  return data;
}

export async function getAgentTask(
  orgSlug: string,
  agentSlug: string,
  taskId: string
): Promise<AgentTaskDetail> {
  const { data } = await api.get<AgentTaskDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/${taskId}/`
  );
  return data;
}

export async function cancelAgentTask(
  orgSlug: string,
  agentSlug: string,
  taskId: string
): Promise<AgentTaskDetail> {
  const { data } = await api.post<AgentTaskDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/${taskId}/cancel/`
  );
  return data;
}

export async function listTaskEvents(
  orgSlug: string,
  agentSlug: string,
  taskId: string,
  afterSequence?: number
): Promise<PaginatedResponse<TaskEventItem>> {
  const params: Record<string, string> = {};
  if (afterSequence !== undefined) params.after_sequence = String(afterSequence);
  const { data } = await api.get<PaginatedResponse<TaskEventItem>>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/${taskId}/events/`,
    { params }
  );
  return data;
}
```

**Step 4: Add re-export to `frontend/lib/api/index.ts`**

Check the file and add: `export * from "./toony-agents";`

**Step 5: Create WebSocket hook**

```typescript
// frontend/hooks/use-toony-agent-websocket.ts
"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { ToonyAgentWsEvent, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseToonyAgentWebSocketOptions {
  agentId: string | null;
  onEvent: (event: ToonyAgentWsEvent) => void;
}

export function useToonyAgentWebSocket({
  agentId,
  onEvent,
}: UseToonyAgentWebSocketOptions): {
  readyState: WsReadyState;
  sendApproval: (taskId: string, action: string, response: string) => void;
  cancelTask: (taskId: string) => void;
} {
  const url = useMemo(() => {
    if (!agentId) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/toony-agents/${agentId}/?token=${token}`;
  }, [agentId]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as ToonyAgentWsEvent;
      if (event?.type) {
        onEvent(event);
      }
    },
    [onEvent],
  );

  const { readyState, send } = useWebSocket({
    url,
    onMessage: handleMessage,
  });

  const sendApproval = useCallback(
    (taskId: string, action: string, response: string) => {
      send({
        type: "approval.response",
        task_id: taskId,
        action,
        response,
      });
    },
    [send],
  );

  const cancelTask = useCallback(
    (taskId: string) => {
      send({ type: "task.cancel", task_id: taskId });
    },
    [send],
  );

  return { readyState, sendApproval, cancelTask };
}
```

**Step 6: Commit**

```bash
git add frontend/types/toony-agents.ts frontend/types/index.ts frontend/lib/api/toony-agents.ts frontend/lib/api/index.ts frontend/hooks/use-toony-agent-websocket.ts
git commit -m "feat(toony-agents): add frontend types, API module, and WebSocket hook"
```

---

## Task 6: Frontend pages — ToonyAgent list + detail + task list

**Files:**
- Create: `frontend/app/(dashboard)/[orgSlug]/toony-agents/page.tsx`
- Create: `frontend/app/(dashboard)/[orgSlug]/toony-agents/[slug]/page.tsx`
- Create: `frontend/components/toony-agents/toony-agent-status-badge.tsx`
- Create: `frontend/components/toony-agents/register-bot-modal.tsx`
- Create: `frontend/components/toony-agents/manage-keys-modal.tsx`
- Create: `frontend/components/toony-agents/create-task-modal.tsx`
- Modify: `frontend/components/sidebar.tsx:10-20` (add nav item)

This task creates the list page, detail page, and the modals. Follow existing patterns from `frontend/app/(dashboard)/[orgSlug]/agents/page.tsx` for structure, data fetching, and modal patterns.

**Step 1: Add sidebar nav item**

Add `{ label: "Toony Agents", path: "/toony-agents" }` to the `NAV_ITEMS` array in `frontend/components/sidebar.tsx`, after the "Agents" entry.

**Step 2: Create status badge component**

Follow the pattern from existing badge components. Three states: OFFLINE (gray), ONLINE (green), BUSY (blue).

**Step 3: Create register bot modal**

Fields: `name` (text), `slug` (slug input). On success, redirect to detail page.

**Step 4: Create manage keys modal**

List existing keys (prefix + name + status). "Generate Key" button that shows raw key once with a copy button. "Revoke" button per key.

**Step 5: Create task modal**

Fields: `title` (text), `prompt` (textarea). On success, redirect to task view.

**Step 6: Create list page**

`/[orgSlug]/toony-agents/page.tsx` — cards grid with status badges, click to navigate to detail.

**Step 7: Create detail page**

`/[orgSlug]/toony-agents/[slug]/page.tsx` — agent info header + task list table. Buttons: [+ New Task], [Manage Keys]. Real-time status updates via `useToonyAgentWebSocket`.

**Step 8: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/toony-agents/ frontend/components/toony-agents/ frontend/components/sidebar.tsx
git commit -m "feat(toony-agents): add frontend list/detail pages and modals"
```

---

## Task 7: Frontend task view — hybrid dashboard + chat

**Files:**
- Create: `frontend/app/(dashboard)/[orgSlug]/toony-agents/[slug]/tasks/[taskId]/page.tsx`
- Create: `frontend/components/toony-agents/task-pipeline-panel.tsx`
- Create: `frontend/components/toony-agents/task-live-output.tsx`
- Create: `frontend/components/toony-agents/task-event-item.tsx`
- Create: `frontend/components/toony-agents/approval-gate-card.tsx`
- Create: `frontend/components/toony-agents/task-input-box.tsx`

This is the core UI — the hybrid dashboard + chat view.

**Step 1: Create task-event-item component**

Renders a single TaskEvent. Switch on `event_type`:
- `LOG` → plain text line
- `TOOL_USE` → `"▸ {tool_name} {file_path}"` styled as a code action
- `TOOL_RESULT` → collapsible result
- `ERROR` → red error text
- `STATUS_CHANGE` → subtle status badge change
- `APPROVAL_NEEDED` → renders `ApprovalGateCard`
- `APPROVAL_RESPONSE` → shows what the user responded

**Step 2: Create approval-gate-card component**

Props: `question`, `options`, `onApprove`, `onReject`, `onMessage`, `isResolved`. Styled as a prominent card with action buttons. When resolved, shows the response and grays out.

**Step 3: Create task-input-box component**

Text input + Send button at bottom of the chat panel. On submit, calls `sendApproval(taskId, "message", text)`. Disabled when task is not in RUNNING or AWAITING_APPROVAL state.

**Step 4: Create task-live-output component (right panel)**

Scrollable list of `TaskEventItem` components. Auto-scrolls to bottom on new events. Loads initial events via REST API, then subscribes to WebSocket for real-time updates. Input box fixed at bottom.

**Step 5: Create task-pipeline-panel component (left panel)**

Groups events into stages by detecting patterns:
- Events with `TOOL_USE` where tool is "Read"/"Grep"/"Glob" → "Exploring"
- Events with `TOOL_USE` where tool is "Edit"/"Write" → "Implementing"
- Events with `TOOL_USE` where tool is "Bash" and command contains "test"/"pytest" → "Testing"
- `APPROVAL_NEEDED` events → show as gate in pipeline

Each stage shows: icon, name, status (completed/active/pending), duration timer for active stage.

**Step 6: Create the task view page**

Split layout: left panel (pipeline, ~25% width) + right panel (live output, ~75% width). Fetches task detail via REST on mount. Subscribes to WebSocket. Manages event state array.

**Step 7: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/toony-agents/\[slug\]/tasks/ frontend/components/toony-agents/
git commit -m "feat(toony-agents): add hybrid dashboard + chat task view"
```

---

## Task 8: toony_agent_runner — Python daemon

**Files:**
- Create: `toony_agent_runner/pyproject.toml`
- Create: `toony_agent_runner/toony_agent_runner/__init__.py`
- Create: `toony_agent_runner/toony_agent_runner/main.py`
- Create: `toony_agent_runner/toony_agent_runner/connection.py`
- Create: `toony_agent_runner/toony_agent_runner/claude_process.py`
- Create: `toony_agent_runner/toony_agent_runner/stream_parser.py`
- Create: `toony_agent_runner/toony_agent_runner/protocol.py`
- Create: `toony_agent_runner/config.example.yml`

**Step 1: Create pyproject.toml**

```toml
[project]
name = "toony-agent-runner"
version = "0.1.0"
description = "Daemon that connects ToonyAgents to the Toony Dev Core backend"
requires-python = ">=3.11"
dependencies = [
    "websockets>=12.0",
    "pyyaml>=6.0",
]

[project.scripts]
toony-agent-runner = "toony_agent_runner.main:cli"
```

**Step 2: Create protocol module**

Dataclasses for all message types (register, heartbeat, task.event, etc.) plus JSON serialization helpers.

**Step 3: Create stream_parser module**

Functions: `parse_stream_json_line(line) -> dict`, `is_approval_gate(event) -> bool`, `extract_approval_data(event) -> dict`. Parses claude `--output-format stream-json` output and detects `AskUserQuestion` tool_use events.

**Step 4: Create connection module**

`class BackendConnection` — manages WebSocket connection with reconnection logic. Methods: `connect()`, `send(msg)`, `receive() -> msg`, `close()`. Exponential backoff on disconnect. Buffers outgoing messages when disconnected.

**Step 5: Create claude_process module**

`class ClaudeProcess` — wraps `asyncio.create_subprocess_exec`. Methods: `start(prompt)`, `stream_events() -> AsyncIterator[dict]`, `send_input(text)`, `cancel()`, `wait() -> int`.

**Step 6: Create main module**

Entry point with CLI argument parsing. Lifecycle: load config → connect to backend → register → idle loop (heartbeat) → on task.assign: spawn claude, stream events, handle approval gates → on completion: send result → back to idle.

**Step 7: Create config.example.yml**

```yaml
backend_url: "ws://localhost:8000/ws/toony-agents/runner/"
api_key: "tok_ta_YOUR_KEY_HERE"
agent_id: "YOUR_AGENT_UUID_HERE"

claude:
  binary: "claude"
  output_format: "stream-json"
  working_directory: "."
  max_task_timeout: 3600

reconnect:
  max_retries: -1
  backoff_base: 1
  backoff_max: 30
```

**Step 8: Commit**

```bash
git add toony_agent_runner/
git commit -m "feat(runner): add toony_agent_runner Python daemon"
```

---

## Task 9: Integration test — end-to-end flow

**Step 1: Manual integration test**

1. Start backend: `make up-backend`
2. Register a ToonyAgent via API or frontend
3. Generate an API key
4. Configure `toony_agent_runner/config.yml` with key + agent_id
5. Start runner: `cd toony_agent_runner && pip install -e . && toony-agent-runner`
6. Verify runner connects (agent status goes ONLINE in DB)
7. Create a task from frontend
8. Verify task streams events to frontend in real-time
9. Verify approval gate pauses and resumes correctly
10. Verify task completion updates status

**Step 2: Fix any issues found during integration**

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix(toony-agents): integration test fixes"
```

---

## Summary

| Task | Component | Estimated Complexity |
|------|-----------|---------------------|
| 1 | Django models + migrations | Medium |
| 2 | Services + selectors | Medium |
| 3 | REST API (serializers, views, URLs) | Medium |
| 4 | WebSocket consumers | High |
| 5 | Frontend types + API + WS hook | Low |
| 6 | Frontend list/detail pages + modals | Medium |
| 7 | Frontend hybrid task view | High |
| 8 | toony_agent_runner daemon | High |
| 9 | Integration testing | Medium |
