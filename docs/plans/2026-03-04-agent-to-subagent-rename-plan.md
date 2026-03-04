# Agent → SubAgent Rename + AI Studio Sidebar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the `Agent` model to `SubAgent` across backend and frontend, split Skills into its own route, and add a collapsible "AI Studio" sidebar section.

**Architecture:** Bottom-up rename: models first, then services/selectors, then serializers/views/urls, then frontend types/API/pages, then sidebar. Each task is independently committable.

**Tech Stack:** Django 5, DRF, Next.js 15, React 19, TypeScript, Tailwind CSS v4

---

### Task 1: Rename backend model files and classes

**Files:**
- Rename: `backend/agents/models/agent.py` → `backend/agents/models/sub_agent.py`
- Rename: `backend/agents/models/agent_skill.py` → `backend/agents/models/sub_agent_skill.py`
- Modify: `backend/agents/models/__init__.py`

**Step 1: Rename `agent.py` to `sub_agent.py` and update all class names**

```bash
mv backend/agents/models/agent.py backend/agents/models/sub_agent.py
```

Edit `backend/agents/models/sub_agent.py` — rename classes:
- `AgentStatus` → `SubAgentStatus`
- `AgentType` → `SubAgentType`
- `Agent` → `SubAgent`
- Change `related_name="agents"` → `related_name="sub_agents"` (organization FK)
- Change `related_name="created_agents"` → `related_name="created_sub_agents"` (created_by FK)
- Change `related_name="assigned_agents"` → `related_name="assigned_sub_agents"` (assigned_projects M2M)
- Change `db_table = "agents"` → `db_table = "sub_agents"`
- Change constraint names: `unique_org_agent_slug` → `unique_org_sub_agent_slug`, `unique_global_agent_slug` → `unique_global_sub_agent_slug`
- Update `__str__` to reference `self.agent_type` (field name stays same, only class/enum renamed)

Full file content for `sub_agent.py`:

```python
from django.conf import settings
from django.db import models
from django.db.models import Q
from encrypted_model_fields.fields import EncryptedTextField

from common.models import BaseModel


class SubAgentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"
    DEPRECATED = "DEPRECATED", "Deprecated"


class SubAgentType(models.TextChoices):
    CODER = "CODER", "Coder"
    REVIEWER = "REVIEWER", "Reviewer"
    TESTER = "TESTER", "Tester"
    PLANNER = "PLANNER", "Planner"
    CUSTOM = "CUSTOM", "Custom"


class SubAgent(BaseModel):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="sub_agents",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.CharField(max_length=250, blank=True, default="")
    markdown = models.TextField(blank=True, default="")
    version = models.CharField(max_length=50, default="0.1.0")
    status = models.CharField(
        max_length=20,
        choices=SubAgentStatus.choices,
        default=SubAgentStatus.DRAFT,
    )
    agent_type = models.CharField(
        max_length=20,
        choices=SubAgentType.choices,
        default=SubAgentType.CUSTOM,
    )
    capabilities = models.JSONField(default=list, blank=True)
    encrypted_configuration = EncryptedTextField(blank=True, default="")
    is_external = models.BooleanField(default=False)
    external_command = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_sub_agents",
    )
    tags = models.JSONField(default=list, blank=True)
    assigned_projects = models.ManyToManyField(
        "projects.Project",
        blank=True,
        related_name="assigned_sub_agents",
    )

    class Meta:
        db_table = "sub_agents"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                condition=Q(organization__isnull=False),
                name="unique_org_sub_agent_slug",
            ),
            models.UniqueConstraint(
                fields=["slug"],
                condition=Q(organization__isnull=True),
                name="unique_global_sub_agent_slug",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.agent_type})"
```

**Step 2: Rename `agent_skill.py` to `sub_agent_skill.py` and update class**

```bash
mv backend/agents/models/agent_skill.py backend/agents/models/sub_agent_skill.py
```

Edit `backend/agents/models/sub_agent_skill.py`:

```python
from django.db import models

from common.models import BaseModel


class SubAgentSkill(BaseModel):
    sub_agent = models.ForeignKey(
        "agents.SubAgent",
        on_delete=models.CASCADE,
        related_name="sub_agent_skills",
    )
    skill = models.ForeignKey(
        "agents.Skill",
        on_delete=models.CASCADE,
        related_name="sub_agent_skills",
    )
    priority = models.IntegerField(default=0)
    is_enabled = models.BooleanField(default=True)
    custom_config = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "sub_agent_skills"
        ordering = ["priority", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["sub_agent", "skill"],
                name="unique_sub_agent_skill",
            ),
        ]

    def __str__(self):
        return f"{self.sub_agent.name} - {self.skill.name}"
```

**Step 3: Update `models/__init__.py`**

```python
from agents.models.sub_agent import SubAgent, SubAgentStatus, SubAgentType
from agents.models.sub_agent_skill import SubAgentSkill
from agents.models.skill import Skill, SkillCategory, SkillStatus
from agents.models.skill_version import SkillVersion

__all__ = [
    "SubAgentStatus",
    "SubAgentType",
    "SubAgent",
    "SkillStatus",
    "SkillCategory",
    "Skill",
    "SubAgentSkill",
    "SkillVersion",
]
```

**Step 4: Commit**

```bash
git add backend/agents/models/
git commit -m "refactor(agents): rename Agent model to SubAgent and AgentSkill to SubAgentSkill"
```

---

### Task 2: Rename backend selectors

**Files:**
- Rename: `backend/agents/selectors/agent_selector.py` → `backend/agents/selectors/sub_agent_selector.py`
- Rename: `backend/agents/selectors/agent_skill_selector.py` → `backend/agents/selectors/sub_agent_skill_selector.py`
- Modify: `backend/agents/selectors/__init__.py`

**Step 1: Rename and update `sub_agent_selector.py`**

```bash
mv backend/agents/selectors/agent_selector.py backend/agents/selectors/sub_agent_selector.py
```

```python
from django.db.models import Q

from agents.models import SubAgent
from accounts.models import OrganizationMembership


def list_sub_agents_for_user(user):
    user_org_ids = OrganizationMembership.objects.filter(
        user=user, is_active=True,
    ).values_list("organization_id", flat=True)

    return SubAgent.objects.filter(
        Q(organization_id__in=user_org_ids) | Q(organization__isnull=True)
    ).order_by("name")


def list_sub_agents_for_organization(organization):
    return SubAgent.objects.filter(
        Q(organization=organization) | Q(organization__isnull=True)
    ).order_by("name")


def get_sub_agent_by_slug(slug, organization=None):
    if organization is not None:
        return SubAgent.objects.filter(organization=organization, slug=slug).first()
    return SubAgent.objects.filter(slug=slug).first()


def get_sub_agent_by_id(sub_agent_id):
    return SubAgent.objects.filter(id=sub_agent_id).first()
```

**Step 2: Rename and update `sub_agent_skill_selector.py`**

```bash
mv backend/agents/selectors/agent_skill_selector.py backend/agents/selectors/sub_agent_skill_selector.py
```

```python
from agents.models import SubAgentSkill


def list_sub_agent_skills(sub_agent):
    return SubAgentSkill.objects.filter(sub_agent=sub_agent).select_related("skill").order_by("priority")


def get_sub_agent_skill_by_id(sub_agent, sub_agent_skill_id):
    return SubAgentSkill.objects.filter(sub_agent=sub_agent, id=sub_agent_skill_id).select_related("skill").first()
```

**Step 3: Update `selectors/__init__.py`**

```python
from agents.selectors.sub_agent_selector import (
    get_sub_agent_by_id,
    get_sub_agent_by_slug,
    list_sub_agents_for_organization,
    list_sub_agents_for_user,
)
from agents.selectors.sub_agent_skill_selector import (
    get_sub_agent_skill_by_id,
    list_sub_agent_skills,
)
from agents.selectors.skill_selector import (
    get_skill_by_id,
    get_skill_by_slug,
    list_skills_for_organization,
    list_skills_for_user,
    list_skill_versions,
)

__all__ = [
    "list_sub_agents_for_user",
    "list_sub_agents_for_organization",
    "get_sub_agent_by_slug",
    "get_sub_agent_by_id",
    "list_skills_for_user",
    "list_skills_for_organization",
    "get_skill_by_slug",
    "get_skill_by_id",
    "list_skill_versions",
    "list_sub_agent_skills",
    "get_sub_agent_skill_by_id",
]
```

**Step 4: Commit**

```bash
git add backend/agents/selectors/
git commit -m "refactor(agents): rename agent selectors to sub_agent"
```

---

### Task 3: Rename backend services

**Files:**
- Rename: `backend/agents/services/agent_service.py` → `backend/agents/services/sub_agent_service.py`
- Rename: `backend/agents/services/agent_skill_service.py` → `backend/agents/services/sub_agent_skill_service.py`
- Modify: `backend/agents/services/__init__.py`

**Step 1: Rename and update `sub_agent_service.py`**

```bash
mv backend/agents/services/agent_service.py backend/agents/services/sub_agent_service.py
```

```python
import json

from common.exceptions import ConflictError
from agents.models import SubAgent
from agents.selectors import get_sub_agent_by_slug


def create_sub_agent(organization, created_by, name, slug, **kwargs):
    if get_sub_agent_by_slug(slug, organization=organization):
        raise ConflictError("A sub-agent with this slug already exists in this organization.")

    encrypted_configuration = kwargs.pop("encrypted_configuration", "")
    if encrypted_configuration and not isinstance(encrypted_configuration, str):
        encrypted_configuration = json.dumps(encrypted_configuration)

    return SubAgent.objects.create(
        organization=organization,
        created_by=created_by,
        name=name,
        slug=slug,
        encrypted_configuration=encrypted_configuration,
        **kwargs,
    )


def update_sub_agent(sub_agent, **kwargs):
    allowed_fields = {
        "name", "description", "markdown", "version", "status", "agent_type",
        "capabilities", "encrypted_configuration", "is_external", "external_command",
        "tags",
    }

    assigned_projects = kwargs.pop("assigned_projects", None)

    for field, value in kwargs.items():
        if field in allowed_fields:
            if field == "encrypted_configuration" and not isinstance(value, str):
                value = json.dumps(value)
            setattr(sub_agent, field, value)

    sub_agent.save()

    if assigned_projects is not None:
        sub_agent.assigned_projects.set(assigned_projects)

    return sub_agent


def delete_sub_agent(sub_agent):
    sub_agent.delete()
```

**Step 2: Rename and update `sub_agent_skill_service.py`**

```bash
mv backend/agents/services/agent_skill_service.py backend/agents/services/sub_agent_skill_service.py
```

```python
from common.exceptions import ConflictError
from agents.models import SubAgentSkill


def assign_skill(sub_agent, skill, priority=0, custom_config=None):
    if SubAgentSkill.objects.filter(sub_agent=sub_agent, skill=skill).exists():
        raise ConflictError("This skill is already assigned to this sub-agent.")

    return SubAgentSkill.objects.create(
        sub_agent=sub_agent,
        skill=skill,
        priority=priority,
        custom_config=custom_config,
    )


def update_sub_agent_skill(sub_agent_skill, **kwargs):
    allowed_fields = {"priority", "is_enabled", "custom_config"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(sub_agent_skill, field, value)
    sub_agent_skill.save()
    return sub_agent_skill


def remove_sub_agent_skill(sub_agent_skill):
    sub_agent_skill.delete()
```

**Step 3: Update `services/__init__.py`**

```python
from agents.services.sub_agent_service import create_sub_agent, delete_sub_agent, update_sub_agent
from agents.services.sub_agent_skill_service import (
    assign_skill,
    remove_sub_agent_skill,
    update_sub_agent_skill,
)
from agents.services.skill_service import create_skill, delete_skill, update_skill

__all__ = [
    "create_sub_agent",
    "update_sub_agent",
    "delete_sub_agent",
    "create_skill",
    "update_skill",
    "delete_skill",
    "assign_skill",
    "update_sub_agent_skill",
    "remove_sub_agent_skill",
]
```

**Step 4: Commit**

```bash
git add backend/agents/services/
git commit -m "refactor(agents): rename agent services to sub_agent"
```

---

### Task 4: Rename backend serializers

**Files:**
- Modify: `backend/agents/serializers/input.py`
- Modify: `backend/agents/serializers/output.py`

**Step 1: Update `input.py`** — rename class names and imports

Changes:
- `from agents.models.agent import AgentStatus, AgentType` → `from agents.models.sub_agent import SubAgentStatus, SubAgentType`
- `CreateAgentSerializer` → `CreateSubAgentSerializer` (use `SubAgentStatus` / `SubAgentType` for choices)
- `UpdateAgentSerializer` → `UpdateSubAgentSerializer` (same)
- `CreateAgentSkillSerializer` → `CreateSubAgentSkillSerializer`
- `UpdateAgentSkillSerializer` → `UpdateSubAgentSkillSerializer`
- Section comment `# --- Agent ---` → `# --- SubAgent ---`
- Section comment `# --- AgentSkill ---` → `# --- SubAgentSkill ---`

**Step 2: Update `output.py`** — rename class names and imports

Changes:
- `from agents.models import Agent, AgentSkill, Skill, SkillVersion` → `from agents.models import SubAgent, SubAgentSkill, Skill, SkillVersion`
- `AgentListSerializer` → `SubAgentListSerializer`, `model = Agent` → `model = SubAgent`
- `AgentDetailSerializer` → `SubAgentDetailSerializer`, `model = Agent` → `model = SubAgent`
- `AgentSkillSerializer` → `SubAgentSkillSerializer`, `model = AgentSkill` → `model = SubAgentSkill`
- Section comment `# --- Agent ---` → `# --- SubAgent ---`
- Section comment `# --- AgentSkill ---` → `# --- SubAgentSkill ---`

**Step 3: Commit**

```bash
git add backend/agents/serializers/
git commit -m "refactor(agents): rename agent serializers to sub_agent"
```

---

### Task 5: Rename backend views

**Files:**
- Rename: `backend/agents/views/agent_views.py` → `backend/agents/views/sub_agent_views.py`
- Rename: `backend/agents/views/agent_skill_views.py` → `backend/agents/views/sub_agent_skill_views.py`
- Modify: `backend/agents/views/__init__.py`

**Step 1: Rename and update `sub_agent_views.py`**

```bash
mv backend/agents/views/agent_views.py backend/agents/views/sub_agent_views.py
```

Changes:
- All imports updated: `get_agent_by_slug` → `get_sub_agent_by_slug`, etc.
- `CreateAgentSerializer` → `CreateSubAgentSerializer`, `UpdateAgentSerializer` → `UpdateSubAgentSerializer`
- `AgentDetailSerializer` → `SubAgentDetailSerializer`, `AgentListSerializer` → `SubAgentListSerializer`
- `create_agent` → `create_sub_agent`, `delete_agent` → `delete_sub_agent`, `update_agent` → `update_sub_agent`
- `AgentListCreateView` → `SubAgentListCreateView`
- `AgentDetailView` → `SubAgentDetailView`
- URL param: `agent_slug` → `sub_agent_slug`
- Error message: `"Agent not found."` stays semantically clear as `"Not found."`
- Local variable names: `agent` → `sub_agent`, `agents` → `sub_agents`

**Step 2: Rename and update `sub_agent_skill_views.py`**

```bash
mv backend/agents/views/agent_skill_views.py backend/agents/views/sub_agent_skill_views.py
```

Changes:
- All imports updated to sub_agent versions
- `AgentSkillListCreateView` → `SubAgentSkillListCreateView`
- `AgentSkillDetailView` → `SubAgentSkillDetailView`
- URL params: `agent_slug` → `sub_agent_slug`, `agent_skill_id` → `sub_agent_skill_id`
- Local variables: `agent` → `sub_agent`, `agent_skill` → `sub_agent_skill`, `agent_skills` → `sub_agent_skills`

**Step 3: Update `views/__init__.py`**

```python
from agents.views.sub_agent_views import SubAgentDetailView, SubAgentListCreateView
from agents.views.sub_agent_skill_views import SubAgentSkillDetailView, SubAgentSkillListCreateView
from agents.views.skill_views import (
    SkillDetailView,
    SkillListCreateView,
    SkillVersionListView,
)

__all__ = [
    "SubAgentListCreateView",
    "SubAgentDetailView",
    "SubAgentSkillListCreateView",
    "SubAgentSkillDetailView",
    "SkillListCreateView",
    "SkillDetailView",
    "SkillVersionListView",
]
```

**Step 4: Commit**

```bash
git add backend/agents/views/
git commit -m "refactor(agents): rename agent views to sub_agent"
```

---

### Task 6: Update backend URLs, admin, consumers, routing, and config

**Files:**
- Modify: `backend/agents/urls.py`
- Modify: `backend/agents/admin.py`
- Modify: `backend/agents/consumers.py`
- Modify: `backend/agents/routing.py`
- Modify: `backend/config/routing.py` (import alias rename only)

**Step 1: Update `urls.py`**

```python
from django.urls import path

from agents.views import (
    SubAgentDetailView,
    SubAgentListCreateView,
    SubAgentSkillDetailView,
    SubAgentSkillListCreateView,
    SkillDetailView,
    SkillListCreateView,
    SkillVersionListView,
)

app_name = "agents"

urlpatterns = [
    # SubAgents
    path("subagents/", SubAgentListCreateView.as_view(), name="sub-agent-list-create"),
    path("subagents/<slug:sub_agent_slug>/", SubAgentDetailView.as_view(), name="sub-agent-detail"),
    path("subagents/<slug:sub_agent_slug>/skills/", SubAgentSkillListCreateView.as_view(), name="sub-agent-skill-list-create"),
    path(
        "subagents/<slug:sub_agent_slug>/skills/<uuid:sub_agent_skill_id>/",
        SubAgentSkillDetailView.as_view(),
        name="sub-agent-skill-detail",
    ),
    # Skills
    path("skills/", SkillListCreateView.as_view(), name="skill-list-create"),
    path("skills/<slug:skill_slug>/", SkillDetailView.as_view(), name="skill-detail"),
    path("skills/<slug:skill_slug>/versions/", SkillVersionListView.as_view(), name="skill-version-list"),
]
```

**Step 2: Update `admin.py`**

```python
from django.contrib import admin

from agents.models import SubAgent, SubAgentSkill, Skill, SkillVersion


@admin.register(SubAgent)
class SubAgentAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "agent_type", "status", "version", "created_at")
    list_filter = ("status", "agent_type")
    search_fields = ("name", "slug", "organization__name")
    exclude = ("encrypted_configuration",)
    ordering = ("-created_at",)


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "category", "status", "version", "created_at")
    list_filter = ("status", "category")
    search_fields = ("name", "slug", "organization__name")
    ordering = ("-created_at",)


@admin.register(SubAgentSkill)
class SubAgentSkillAdmin(admin.ModelAdmin):
    list_display = ("sub_agent", "skill", "priority", "is_enabled", "created_at")
    list_filter = ("is_enabled",)
    search_fields = ("sub_agent__name", "skill__name")
    ordering = ("sub_agent", "priority")


@admin.register(SkillVersion)
class SkillVersionAdmin(admin.ModelAdmin):
    list_display = ("skill", "version", "created_by", "created_at")
    search_fields = ("skill__name", "version")
    ordering = ("-created_at",)
```

**Step 3: Update `consumers.py`**

- `AgentConsumer` → `SubAgentConsumer`
- `_get_agent_org_id` → `_get_sub_agent_org_id`
- `_update_agent_status` → `_update_sub_agent_status`
- All `Agent` model references → `SubAgent`
- `self.agent_id` → `self.sub_agent_id`
- `self.group_name = f"agent_{...}"` → `f"sub_agent_{...}"`
- URL route kwarg: `agent_id` → `sub_agent_id`

```python
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from accounts.models import OrganizationMembership
from agents.models import SubAgent


@database_sync_to_async
def _get_sub_agent_org_id(sub_agent_id):
    try:
        return str(
            SubAgent.objects.values_list("organization_id", flat=True).get(id=sub_agent_id)
        )
    except SubAgent.DoesNotExist:
        return None


@database_sync_to_async
def _is_org_member(user, org_id):
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id=org_id,
        is_active=True,
    ).exists()


@database_sync_to_async
def _update_sub_agent_status(sub_agent_id, status):
    SubAgent.objects.filter(id=sub_agent_id).update(status=status)


class SubAgentConsumer(AsyncJsonWebsocketConsumer):
    """
    Bidirectional WebSocket for sub-agent task assignment, results,
    status updates, and heartbeat.
    """

    async def connect(self):
        self.sub_agent_id = self.scope["url_route"]["kwargs"]["sub_agent_id"]
        self.group_name = f"sub_agent_{self.sub_agent_id}"
        user = self.scope.get("user")

        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        org_id = await _get_sub_agent_org_id(self.sub_agent_id)
        if org_id is None or not await _is_org_member(user, org_id):
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "task.result":
            pass
        elif msg_type == "status.update":
            status = content.get("status")
            if status:
                await _update_sub_agent_status(self.sub_agent_id, status)
        elif msg_type == "heartbeat":
            await self.send_json({"type": "heartbeat.ack"})

    async def task_assign(self, event):
        await self.send_json({"type": "task.assign", "data": event["data"]})
```

**Step 4: Update `routing.py`**

```python
from django.urls import path

from agents.consumers import SubAgentConsumer

websocket_urlpatterns = [
    path("ws/subagents/<uuid:sub_agent_id>/", SubAgentConsumer.as_asgi()),
]
```

**Step 5: Update `config/routing.py`** — just alias name for clarity (optional, functional as-is)

No change needed — the import `from agents.routing import websocket_urlpatterns as agent_ws` still works since we didn't rename the variable in `agents/routing.py`.

**Step 6: Commit**

```bash
git add backend/agents/urls.py backend/agents/admin.py backend/agents/consumers.py backend/agents/routing.py
git commit -m "refactor(agents): update urls, admin, consumers, routing for SubAgent rename"
```

---

### Task 7: Generate and apply Django migration

**Step 1: Generate migration**

```bash
docker compose exec backend python manage.py makemigrations agents
```

Expected: A migration with `RenameModel`, table renames, constraint renames, and related_name changes.

**Step 2: Review the migration**

Read the generated migration file to verify it correctly handles the rename operations.

**Step 3: Apply migration**

```bash
docker compose exec backend python manage.py migrate
```

**Step 4: Commit**

```bash
git add backend/agents/migrations/
git commit -m "refactor(agents): add migration for Agent→SubAgent rename"
```

---

### Task 8: Run backend tests to verify

**Step 1: Run all tests**

```bash
docker compose exec backend pytest -v
```

Expected: All tests pass (no existing test_agents.py tests to break, but toony_agents tests should still pass).

**Step 2: Run lint**

```bash
docker compose exec backend flake8 --max-line-length=120 --exclude=migrations,__pycache__ agents/
```

Fix any issues found.

**Step 3: Commit fixes if any**

```bash
git add -A && git commit -m "fix(agents): fix lint issues after SubAgent rename"
```

---

### Task 9: Rename frontend types

**Files:**
- Modify: `frontend/types/agents.ts`
- Modify: `frontend/types/index.ts`
- Modify: `frontend/types/websocket.ts`

**Step 1: Update `types/agents.ts`**

Rename all Agent-prefixed types to SubAgent:
- `AgentStatus` → `SubAgentStatus`
- `AgentType` → `SubAgentType`
- `AgentList` → `SubAgentList` (field `agent_type` stays as-is since it matches the API field name)
- `AgentDetail` → `SubAgentDetail`
- `CreateAgentPayload` → `CreateSubAgentPayload`
- `UpdateAgentPayload` → `UpdateSubAgentPayload`
- `AgentSkill` → `SubAgentSkill`
- `CreateAgentSkillPayload` → `CreateSubAgentSkillPayload`
- `UpdateAgentSkillPayload` → `UpdateSubAgentSkillPayload`

Skill types stay exactly the same.

**Step 2: Update `types/index.ts`** — update the re-export block (lines 87-104)

```typescript
export type {
  SubAgentStatus,
  SubAgentType,
  SkillStatus,
  SkillCategory,
  SubAgentList,
  SubAgentDetail,
  CreateSubAgentPayload,
  UpdateSubAgentPayload,
  SkillList,
  SkillDetail,
  CreateSkillPayload,
  UpdateSkillPayload,
  SubAgentSkill,
  CreateSubAgentSkillPayload,
  UpdateSubAgentSkillPayload,
  SkillVersion,
} from "./agents";
```

**Step 3: Update `types/websocket.ts`** — rename WebSocket types (lines 43-54)

- `AgentWsEvent` → `SubAgentWsEvent`
- Comments: `// --- Agent WebSocket Events ---` → `// --- SubAgent WebSocket Events ---`

Also update `types/index.ts` re-export:
- `AgentWsEvent` → `SubAgentWsEvent`

**Step 4: Commit**

```bash
git add frontend/types/
git commit -m "refactor(frontend): rename Agent types to SubAgent"
```

---

### Task 10: Rename frontend API modules

**Files:**
- Modify: `frontend/lib/api/agents.ts` (rename to `sub-agents.ts`)
- Modify: `frontend/lib/api/agent-skills.ts` (rename to `sub-agent-skills.ts`)
- Modify: `frontend/lib/api/index.ts`

**Step 1: Rename `agents.ts` → `sub-agents.ts`**

```bash
mv frontend/lib/api/agents.ts frontend/lib/api/sub-agents.ts
```

Update contents — change function names and API paths:

```typescript
import api from "@/lib/api";
import type {
  SubAgentList,
  SubAgentDetail,
  CreateSubAgentPayload,
  UpdateSubAgentPayload,
  PaginatedResponse,
} from "@/types";

export async function listSubAgents(
  orgSlug?: string,
  cursor?: string
): Promise<PaginatedResponse<SubAgentList>> {
  const params: Record<string, string> = {};
  if (orgSlug) params.organization = orgSlug;
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<SubAgentList>>(
    `/subagents/`,
    { params }
  );
  return data;
}

export async function createSubAgent(
  payload: CreateSubAgentPayload
): Promise<SubAgentDetail> {
  const { data } = await api.post<SubAgentDetail>(
    `/subagents/`,
    payload
  );
  return data;
}

export async function getSubAgent(
  subAgentSlug: string
): Promise<SubAgentDetail> {
  const { data } = await api.get<SubAgentDetail>(
    `/subagents/${subAgentSlug}/`
  );
  return data;
}

export async function updateSubAgent(
  subAgentSlug: string,
  payload: UpdateSubAgentPayload
): Promise<SubAgentDetail> {
  const { data } = await api.put<SubAgentDetail>(
    `/subagents/${subAgentSlug}/`,
    payload
  );
  return data;
}

export async function deleteSubAgent(
  subAgentSlug: string
): Promise<void> {
  await api.delete(`/subagents/${subAgentSlug}/`);
}
```

**Step 2: Rename `agent-skills.ts` → `sub-agent-skills.ts`**

```bash
mv frontend/lib/api/agent-skills.ts frontend/lib/api/sub-agent-skills.ts
```

Update contents — change function names and API paths:

```typescript
import api from "@/lib/api";
import type {
  SubAgentSkill,
  CreateSubAgentSkillPayload,
  UpdateSubAgentSkillPayload,
  PaginatedResponse,
} from "@/types";

export async function listSubAgentSkills(
  subAgentSlug: string,
  cursor?: string
): Promise<PaginatedResponse<SubAgentSkill>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<SubAgentSkill>>(
    `/subagents/${subAgentSlug}/skills/`,
    { params }
  );
  return data;
}

export async function assignSkill(
  subAgentSlug: string,
  payload: CreateSubAgentSkillPayload
): Promise<SubAgentSkill> {
  const { data } = await api.post<SubAgentSkill>(
    `/subagents/${subAgentSlug}/skills/`,
    payload
  );
  return data;
}

export async function updateSubAgentSkill(
  subAgentSlug: string,
  subAgentSkillId: string,
  payload: UpdateSubAgentSkillPayload
): Promise<SubAgentSkill> {
  const { data } = await api.put<SubAgentSkill>(
    `/subagents/${subAgentSlug}/skills/${subAgentSkillId}/`,
    payload
  );
  return data;
}

export async function removeSubAgentSkill(
  subAgentSlug: string,
  subAgentSkillId: string
): Promise<void> {
  await api.delete(
    `/subagents/${subAgentSlug}/skills/${subAgentSkillId}/`
  );
}
```

**Step 3: Update `lib/api/index.ts`** — update barrel exports

Replace the agents and agent-skills export blocks:

```typescript
export {
  listSubAgents,
  createSubAgent,
  getSubAgent,
  updateSubAgent,
  deleteSubAgent,
} from "./sub-agents";
```

```typescript
export {
  listSubAgentSkills,
  assignSkill,
  updateSubAgentSkill,
  removeSubAgentSkill,
} from "./sub-agent-skills";
```

Skills exports stay pointing at `"./skills"` — no change.

**Step 4: Commit**

```bash
git add frontend/lib/api/
git commit -m "refactor(frontend): rename agent API modules to sub-agent"
```

---

### Task 11: Update frontend WebSocket hook

**Files:**
- Modify: `frontend/hooks/use-agent-websocket.ts`

**Step 1: Update the hook**

Changes:
- Import `SubAgentWsEvent` instead of `AgentWsEvent`
- Rename interface: `UseAgentWebSocketOptions` → `UseSubAgentWebSocketOptions`
- Rename field: `agentId` → `subAgentId`
- Rename function: `useAgentWebSocket` → `useSubAgentWebSocket`
- Update WS URL: `/ws/agents/` → `/ws/subagents/`

```typescript
"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { SubAgentWsEvent, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseSubAgentWebSocketOptions {
  subAgentId: string | null;
  onEvent: (event: SubAgentWsEvent) => void;
}

export function useSubAgentWebSocket({
  subAgentId,
  onEvent,
}: UseSubAgentWebSocketOptions): {
  readyState: WsReadyState;
  sendTaskResult: (taskId: string, output: unknown) => void;
  sendStatusUpdate: (status: string) => void;
  sendHeartbeat: () => void;
} {
  const url = useMemo(() => {
    if (!subAgentId) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/subagents/${subAgentId}/?token=${token}`;
  }, [subAgentId]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as SubAgentWsEvent;
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

  const sendTaskResult = useCallback(
    (taskId: string, output: unknown) => {
      send({ type: "task.result", task_id: taskId, output });
    },
    [send],
  );

  const sendStatusUpdate = useCallback(
    (status: string) => {
      send({ type: "status.update", status });
    },
    [send],
  );

  const sendHeartbeat = useCallback(() => {
    send({ type: "heartbeat" });
  }, [send]);

  return { readyState, sendTaskResult, sendStatusUpdate, sendHeartbeat };
}
```

**Step 2: Commit**

```bash
git add frontend/hooks/use-agent-websocket.ts
git commit -m "refactor(frontend): rename useAgentWebSocket to useSubAgentWebSocket"
```

---

### Task 12: Create SubAgents page (split from old agents page)

**Files:**
- Delete: `frontend/app/(dashboard)/[orgSlug]/agents/` (entire directory)
- Create: `frontend/app/(dashboard)/[orgSlug]/subagents/page.tsx` — SubAgents list only
- Move: `frontend/app/(dashboard)/[orgSlug]/agents/new/page.tsx` → `frontend/app/(dashboard)/[orgSlug]/subagents/new/page.tsx`
- Move: `frontend/app/(dashboard)/[orgSlug]/agents/[agentSlug]/edit/page.tsx` → `frontend/app/(dashboard)/[orgSlug]/subagents/[agentSlug]/edit/page.tsx`

**Step 1: Create directory and move files**

```bash
mkdir -p frontend/app/\(dashboard\)/\[orgSlug\]/subagents/new
mkdir -p frontend/app/\(dashboard\)/\[orgSlug\]/subagents/\[agentSlug\]/edit
```

**Step 2: Create `subagents/page.tsx`** — SubAgents list only (no skills tab)

This is the agents page.tsx but with:
- Skills tab removed entirely
- All Skills state removed
- Import `SubAgentList` instead of `AgentList`
- Import `listSubAgents, deleteSubAgent` instead of `listAgents, deleteAgent`
- Heading: "Sub-Agents" instead of "Agents & Skills"
- Button label: "Add sub-agent"
- All `agent` variable names → `subAgent` (or keep `agent` prefix for brevity)
- Route links: `/${orgSlug}/subagents/...`

**Step 3: Create `subagents/new/page.tsx`** — Create SubAgent

Based on old agents/new/page.tsx with:
- Import `createSubAgent` instead of `createAgent`
- Import `SubAgentType` instead of `AgentType`
- Page heading: "Create sub-agent"
- Button: "Create sub-agent"
- Route links: `/${orgSlug}/subagents`

**Step 4: Create `subagents/[agentSlug]/edit/page.tsx`** — Edit SubAgent

Based on old agents/[agentSlug]/edit/page.tsx with:
- Import `getSubAgent, updateSubAgent` instead of `getAgent, updateAgent`
- Import `SubAgentDetail, SubAgentStatus, SubAgentType` instead of old types
- Route links: `/${orgSlug}/subagents`

**Step 5: Delete old agents directory**

```bash
rm -rf frontend/app/\(dashboard\)/\[orgSlug\]/agents/
```

**Step 6: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/
git commit -m "refactor(frontend): move agents pages to subagents with SubAgent rename"
```

---

### Task 13: Create Skills page (extracted from old agents page)

**Files:**
- Create: `frontend/app/(dashboard)/[orgSlug]/skills/page.tsx`
- Move: skill create/edit pages from old agents/skills/ to skills/

**Step 1: Create directory**

```bash
mkdir -p frontend/app/\(dashboard\)/\[orgSlug\]/skills/new
mkdir -p frontend/app/\(dashboard\)/\[orgSlug\]/skills/\[skillSlug\]/edit
```

**Step 2: Create `skills/page.tsx`** — Skills list only

Extracted from the "skills" tab of the old agents page.tsx. Contains:
- Heading: "Skills"
- Add skill button → `/${orgSlug}/skills/new`
- Skills table (Name, Category, Status, Version, Actions)
- Edit links → `/${orgSlug}/skills/${skill.slug}/edit`
- Delete modal
- No agents tab, no agent state

**Step 3: Create `skills/new/page.tsx`** — Create Skill

Based on old agents/skills/new/page.tsx with:
- Back button → `/${orgSlug}/skills`
- On success redirect → `/${orgSlug}/skills`

**Step 4: Create `skills/[skillSlug]/edit/page.tsx`** — Edit Skill

Based on old agents/skills/[skillSlug]/edit/page.tsx with:
- Back button → `/${orgSlug}/skills`
- On success redirect → `/${orgSlug}/skills`

**Step 5: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/skills/
git commit -m "feat(frontend): add standalone Skills pages extracted from agents"
```

---

### Task 14: Implement collapsible AI Studio sidebar section

**Files:**
- Modify: `frontend/components/sidebar.tsx`

**Step 1: Restructure NAV_ITEMS**

Add a type for nav items that supports children:

```typescript
interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  children: NavItem[];
}

type SidebarItem = NavItem | NavGroup;
```

Replace the flat `NAV_ITEMS` array. Remove the standalone Agents and Toony Agents entries. Add an AI Studio group:

```typescript
{
  label: "AI Studio",
  icon: (/* sparkles icon SVG */),
  children: [
    { label: "SubAgents", path: "/subagents", icon: (/* circuit board icon */) },
    { label: "Skills", path: "/skills", icon: (/* puzzle piece or code bracket icon */) },
    { label: "Toony Agents", path: "/toony-agents", icon: (/* sparkles icon */) },
  ],
}
```

**Step 2: Add collapsible state**

```typescript
const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

// Auto-expand groups with active children
useEffect(() => {
  const expanded: Record<string, boolean> = {};
  NAV_ITEMS.forEach((item) => {
    if ("children" in item) {
      const isChildActive = item.children.some((child) => {
        const href = `${basePath}${child.path}`;
        return pathname.startsWith(href);
      });
      if (isChildActive) expanded[item.label] = true;
    }
  });
  setExpandedGroups((prev) => ({ ...prev, ...expanded }));
}, [pathname, basePath]);
```

**Step 3: Render groups with collapse/expand**

For group items, render:
- A button with the group label, icon, and chevron
- Clicking toggles `expandedGroups[label]`
- When expanded, render children with `pl-4` indent
- Chevron rotates: `rotate-0` collapsed, `rotate-90` expanded

**Step 4: Add Skills icon SVG**

Use the Heroicons `CommandLineIcon` or `PuzzlePieceIcon` outline for Skills:

```tsx
<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
  <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
</svg>
```

**Step 5: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat(frontend): add collapsible AI Studio sidebar section with SubAgents, Skills, Toony Agents"
```

---

### Task 15: Update CLAUDE.md files and verify frontend build

**Files:**
- Modify: `backend/CLAUDE.md` — update Agent references
- Modify: `frontend/CLAUDE.md` — update route structure and type names
- Modify: `CLAUDE.md` — update if any agent references

**Step 1: Update backend/CLAUDE.md**

In the Field Map section:
- Rename `Agent` → `SubAgent`, `AgentSkill` → `SubAgentSkill`
- Update API routes: `/agents/` → `/subagents/`
- WebSocket: `ws/agents/` → `ws/subagents/`

**Step 2: Update frontend/CLAUDE.md**

In the Route Structure section:
- `agents/` → `subagents/` and add `skills/`
- Update type names in Field Map

**Step 3: Run frontend lint**

```bash
cd frontend && ./node_modules/.bin/next lint
```

Fix any issues.

**Step 4: Run frontend build**

```bash
cd frontend && ./node_modules/.bin/next build
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add backend/CLAUDE.md frontend/CLAUDE.md CLAUDE.md
git commit -m "docs: update CLAUDE.md files for SubAgent rename and AI Studio sidebar"
```

---

### Task 16: Update project memory

**Files:**
- Modify: `/Users/LuisMo/.claude/projects/-Users-LuisMo-Documents-projects-toony-dev-core/memory/MEMORY.md`

**Step 1: Update memory with new naming**

Update the agents section to reflect SubAgent naming, new routes, and AI Studio sidebar structure.
