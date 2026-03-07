# Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Workflows feature — DAG-based pipelines of SubAgents and Skills, configurable via UI, resolved per-issue via MCP tool, executed by a Workflow Executor subagent in Claude Code.

**Architecture:** New `workflows` Django app following the existing layered pattern (models → selectors → services → serializers → views). Frontend adds a `/workflows` page in AI Studio with list and visual DAG editor. MCP server gets a `get_issue_workflow` tool that resolves and returns the workflow as YAML.

**Tech Stack:** Django 5 / DRF (backend), Next.js 15 / React 19 / @xyflow/react (frontend DAG editor), FastMCP + PyYAML (MCP tool)

**Design Doc:** `docs/plans/2026-03-07-workflows-design.md`

---

### Task 1: Create workflows Django app scaffold

**Files:**
- Create: `backend/workflows/__init__.py`
- Create: `backend/workflows/apps.py`
- Create: `backend/workflows/admin.py`
- Create: `backend/workflows/models/__init__.py`
- Create: `backend/workflows/selectors/__init__.py`
- Create: `backend/workflows/services/__init__.py`
- Create: `backend/workflows/serializers/__init__.py`
- Create: `backend/workflows/serializers/input.py`
- Create: `backend/workflows/serializers/output.py`
- Create: `backend/workflows/views/__init__.py`
- Create: `backend/workflows/urls.py`
- Modify: `backend/config/settings/base.py:13-38` (INSTALLED_APPS)
- Modify: `backend/config/urls.py:9-26` (urlpatterns)

**Step 1: Create the app directory structure**

```bash
mkdir -p backend/workflows/{models,selectors,services,serializers,views}
```

**Step 2: Create `backend/workflows/__init__.py`**

Empty file.

**Step 3: Create `backend/workflows/apps.py`**

```python
from django.apps import AppConfig


class WorkflowsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "workflows"
```

**Step 4: Create empty `__init__.py` files**

Create empty `__init__.py` in: `models/`, `selectors/`, `services/`, `serializers/`, `views/`.

**Step 5: Create placeholder files**

Create empty files: `admin.py`, `serializers/input.py`, `serializers/output.py`, `urls.py`.

**Step 6: Register app in settings**

Modify `backend/config/settings/base.py` — add `"workflows"` to INSTALLED_APPS after `"agents"`:

```python
    "agents",
    "workflows",
    "toony_agents",
```

**Step 7: Register URLs in root config**

Modify `backend/config/urls.py` — add after the agents include:

```python
    path("api/", include("agents.urls")),
    path("api/", include("workflows.urls")),
```

**Step 8: Create minimal `backend/workflows/urls.py`**

```python
from django.urls import path

app_name = "workflows"

urlpatterns = []
```

**Step 9: Verify app loads**

Run: `docker compose exec backend python manage.py check`
Expected: `System check identified no issues.`

**Step 10: Commit**

```bash
git add backend/workflows/ backend/config/settings/base.py backend/config/urls.py
git commit -m "feat(workflows): scaffold workflows Django app"
```

---

### Task 2: Create Workflow, WorkflowNode, WorkflowEdge models

**Files:**
- Create: `backend/workflows/models/workflow.py`
- Create: `backend/workflows/models/workflow_node.py`
- Create: `backend/workflows/models/workflow_edge.py`
- Modify: `backend/workflows/models/__init__.py`
- Modify: `backend/workflows/admin.py`

**Step 1: Create `backend/workflows/models/workflow.py`**

```python
from django.conf import settings
from django.db import models

from common.models import BaseModel


class Workflow(BaseModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflows",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflows",
    )
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflows",
    )
    label = models.ForeignKey(
        "workspace.Label",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflows",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_workflows",
    )

    class Meta:
        db_table = "workflows"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                condition=models.Q(organization__isnull=False),
                name="unique_org_workflow_slug",
            ),
            models.UniqueConstraint(
                fields=["project", "slug"],
                condition=models.Q(project__isnull=False),
                name="unique_project_workflow_slug",
            ),
            models.UniqueConstraint(
                fields=["slug"],
                condition=models.Q(
                    organization__isnull=True,
                    project__isnull=True,
                    issue__isnull=True,
                ),
                name="unique_global_workflow_slug",
            ),
        ]

    def __str__(self):
        return self.name
```

**Step 2: Create `backend/workflows/models/workflow_node.py`**

```python
from django.db import models

from common.models import BaseModel


class WorkflowNodeType(models.TextChoices):
    SUBAGENT = "SUBAGENT", "SubAgent"
    SKILL = "SKILL", "Skill"


class WorkflowNode(BaseModel):
    workflow = models.ForeignKey(
        "workflows.Workflow",
        on_delete=models.CASCADE,
        related_name="nodes",
    )
    node_type = models.CharField(
        max_length=20,
        choices=WorkflowNodeType.choices,
    )
    sub_agent = models.ForeignKey(
        "agents.SubAgent",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_nodes",
    )
    skill = models.ForeignKey(
        "agents.Skill",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_nodes",
    )
    position_x = models.FloatField(default=0)
    position_y = models.FloatField(default=0)
    config_overrides = models.JSONField(default=dict)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "workflow_nodes"
        ordering = ["order", "created_at"]

    def __str__(self):
        ref = self.sub_agent or self.skill
        return f"{self.node_type}: {ref}"
```

**Step 3: Create `backend/workflows/models/workflow_edge.py`**

```python
from django.db import models

from common.models import BaseModel


class WorkflowEdge(BaseModel):
    workflow = models.ForeignKey(
        "workflows.Workflow",
        on_delete=models.CASCADE,
        related_name="edges",
    )
    source_node = models.ForeignKey(
        "workflows.WorkflowNode",
        on_delete=models.CASCADE,
        related_name="outgoing_edges",
    )
    target_node = models.ForeignKey(
        "workflows.WorkflowNode",
        on_delete=models.CASCADE,
        related_name="incoming_edges",
    )

    class Meta:
        db_table = "workflow_edges"
        constraints = [
            models.UniqueConstraint(
                fields=["source_node", "target_node"],
                name="unique_workflow_edge",
            ),
        ]

    def __str__(self):
        return f"{self.source_node} → {self.target_node}"
```

**Step 4: Update `backend/workflows/models/__init__.py`**

```python
from workflows.models.workflow import Workflow
from workflows.models.workflow_node import WorkflowNode, WorkflowNodeType
from workflows.models.workflow_edge import WorkflowEdge

__all__ = [
    "Workflow",
    "WorkflowNode",
    "WorkflowNodeType",
    "WorkflowEdge",
]
```

**Step 5: Create `backend/workflows/admin.py`**

```python
from django.contrib import admin

from workflows.models import Workflow, WorkflowNode, WorkflowEdge


class WorkflowNodeInline(admin.TabularInline):
    model = WorkflowNode
    extra = 0


class WorkflowEdgeInline(admin.TabularInline):
    model = WorkflowEdge
    extra = 0


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_active", "organization", "project", "label", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug"]
    inlines = [WorkflowNodeInline, WorkflowEdgeInline]
```

**Step 6: Generate and run migrations**

Run: `docker compose exec backend python manage.py makemigrations workflows`
Expected: `Migrations for 'workflows': workflows/migrations/0001_initial.py`

Run: `docker compose exec backend python manage.py migrate`
Expected: `Applying workflows.0001_initial... OK`

**Step 7: Verify models load**

Run: `docker compose exec backend python manage.py check`
Expected: `System check identified no issues.`

**Step 8: Commit**

```bash
git add backend/workflows/
git commit -m "feat(workflows): add Workflow, WorkflowNode, WorkflowEdge models"
```

---

### Task 3: Create test factories and fixtures

**Files:**
- Modify: `backend/tests/factories.py`
- Modify: `backend/conftest.py`

**Step 1: Add factories to `backend/tests/factories.py`**

Add imports at top:

```python
from agents.models import SubAgent, Skill
from workflows.models import Workflow, WorkflowNode, WorkflowEdge
```

Add factory classes at the end of the file:

```python
class SubAgentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = SubAgent

    name = factory.Sequence(lambda n: f"SubAgent {n}")
    slug = factory.Sequence(lambda n: f"subagent-{n}")
    created_by = factory.SubFactory(UserFactory)


class SkillFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Skill

    name = factory.Sequence(lambda n: f"Skill {n}")
    slug = factory.Sequence(lambda n: f"skill-{n}")
    created_by = factory.SubFactory(UserFactory)


class WorkflowFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Workflow

    name = factory.Sequence(lambda n: f"Workflow {n}")
    slug = factory.Sequence(lambda n: f"workflow-{n}")
    created_by = factory.SubFactory(UserFactory)


class WorkflowNodeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = WorkflowNode

    workflow = factory.SubFactory(WorkflowFactory)
    node_type = "SUBAGENT"
    sub_agent = factory.SubFactory(SubAgentFactory)
    order = factory.Sequence(lambda n: n)


class WorkflowEdgeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = WorkflowEdge

    workflow = factory.SubFactory(WorkflowFactory)
    source_node = factory.SubFactory(WorkflowNodeFactory)
    target_node = factory.SubFactory(WorkflowNodeFactory)
```

**Step 2: Add fixtures to `backend/conftest.py`**

Add imports:

```python
from tests.factories import (
    # ... existing imports ...
    SubAgentFactory,
    SkillFactory,
    WorkflowFactory,
    WorkflowNodeFactory,
    WorkflowEdgeFactory,
)
```

Add fixtures at end:

```python
@pytest.fixture()
def sub_agent(user):
    return SubAgentFactory(created_by=user)


@pytest.fixture()
def skill(user):
    return SkillFactory(created_by=user)


@pytest.fixture()
def workflow(user):
    return WorkflowFactory(created_by=user)
```

**Step 3: Verify factories work**

Run: `docker compose exec backend python -c "from tests.factories import WorkflowFactory; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/tests/factories.py backend/conftest.py
git commit -m "feat(workflows): add test factories and fixtures"
```

---

### Task 4: Workflow CRUD — selectors, services, serializers, views (TDD)

**Files:**
- Create: `backend/workflows/selectors/workflow_selector.py`
- Create: `backend/workflows/services/workflow_service.py`
- Modify: `backend/workflows/selectors/__init__.py`
- Modify: `backend/workflows/services/__init__.py`
- Modify: `backend/workflows/serializers/input.py`
- Modify: `backend/workflows/serializers/output.py`
- Create: `backend/workflows/views/workflow_views.py`
- Modify: `backend/workflows/views/__init__.py`
- Modify: `backend/workflows/urls.py`
- Create: `backend/tests/test_workflows.py`

**Step 1: Write failing tests in `backend/tests/test_workflows.py`**

```python
import pytest
from rest_framework import status

pytestmark = pytest.mark.django_db

FAKE_UUID = "00000000-0000-0000-0000-000000000000"


def workflows_url():
    return "/api/workflows/"


def workflow_url(workflow_id):
    return f"/api/workflows/{workflow_id}/"


class TestWorkflowList:
    def test_list_workflows(self, authenticated_client, workflow):
        response = authenticated_client.get(workflows_url())
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_workflows_unauthenticated(self, api_client):
        response = api_client.get(workflows_url())
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_workflow(self, authenticated_client):
        data = {"name": "My Workflow", "slug": "my-workflow"}
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Workflow"
        assert response.data["slug"] == "my-workflow"
        assert response.data["is_active"] is True

    def test_create_workflow_with_org(self, authenticated_client, organization):
        data = {
            "name": "Org Workflow",
            "slug": "org-workflow",
            "organization": str(organization.id),
        }
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["organization"] == str(organization.id)

    def test_create_workflow_with_project(self, authenticated_client, project):
        data = {
            "name": "Project Workflow",
            "slug": "project-workflow",
            "project": str(project.id),
        }
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["project"] == str(project.id)

    def test_create_workflow_missing_name(self, authenticated_client):
        data = {"slug": "no-name"}
        response = authenticated_client.post(workflows_url(), data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestWorkflowDetail:
    def test_get_workflow(self, authenticated_client, workflow):
        response = authenticated_client.get(workflow_url(workflow.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(workflow.id)

    def test_get_workflow_not_found(self, authenticated_client):
        response = authenticated_client.get(workflow_url(FAKE_UUID))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_workflow(self, authenticated_client, workflow):
        data = {"name": "Updated Name", "is_active": False}
        response = authenticated_client.patch(
            workflow_url(workflow.id), data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Name"
        assert response.data["is_active"] is False

    def test_delete_workflow(self, authenticated_client, workflow):
        response = authenticated_client.delete(workflow_url(workflow.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_workflows.py -v`
Expected: All tests FAIL (URLs not yet wired)

**Step 3: Create `backend/workflows/selectors/workflow_selector.py`**

```python
from workflows.models import Workflow


def list_workflows():
    return Workflow.objects.all().order_by("name")


def get_workflow_by_id(workflow_id):
    return (
        Workflow.objects.filter(id=workflow_id)
        .select_related("organization", "project", "issue", "label", "created_by")
        .prefetch_related("nodes", "edges")
        .first()
    )
```

**Step 4: Update `backend/workflows/selectors/__init__.py`**

```python
from workflows.selectors.workflow_selector import (
    get_workflow_by_id,
    list_workflows,
)

__all__ = [
    "get_workflow_by_id",
    "list_workflows",
]
```

**Step 5: Create `backend/workflows/services/workflow_service.py`**

```python
from common.exceptions import ConflictError
from workflows.models import Workflow


def create_workflow(created_by, name, slug, **kwargs):
    organization = kwargs.get("organization")
    project = kwargs.get("project")
    issue = kwargs.get("issue")

    # Check slug uniqueness within scope
    qs = Workflow.objects.filter(slug=slug)
    if organization:
        qs = qs.filter(organization=organization)
    elif project:
        qs = qs.filter(project=project)
    elif issue:
        qs = qs.filter(issue=issue)
    else:
        qs = qs.filter(
            organization__isnull=True,
            project__isnull=True,
            issue__isnull=True,
        )

    if qs.exists():
        raise ConflictError("A workflow with this slug already exists in this scope.")

    return Workflow.objects.create(
        created_by=created_by,
        name=name,
        slug=slug,
        **kwargs,
    )


def update_workflow(workflow, **kwargs):
    allowed_fields = {
        "name", "description", "is_active", "label",
    }

    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(workflow, field, value)

    workflow.save()
    return workflow


def delete_workflow(workflow):
    workflow.delete()
```

**Step 6: Update `backend/workflows/services/__init__.py`**

```python
from workflows.services.workflow_service import (
    create_workflow,
    delete_workflow,
    update_workflow,
)

__all__ = [
    "create_workflow",
    "delete_workflow",
    "update_workflow",
]
```

**Step 7: Create `backend/workflows/serializers/input.py`**

```python
from rest_framework import serializers


class CreateWorkflowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    description = serializers.CharField(required=False, default="", allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)
    organization = serializers.UUIDField(required=False, allow_null=True)
    project = serializers.UUIDField(required=False, allow_null=True)
    issue = serializers.UUIDField(required=False, allow_null=True)
    label = serializers.UUIDField(required=False, allow_null=True)


class UpdateWorkflowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    label = serializers.UUIDField(required=False, allow_null=True)
```

**Step 8: Create `backend/workflows/serializers/output.py`**

```python
from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from workflows.models import Workflow, WorkflowNode, WorkflowEdge


class WorkflowNodeListSerializer(serializers.ModelSerializer):
    sub_agent_slug = serializers.SlugRelatedField(
        source="sub_agent", slug_field="slug", read_only=True
    )
    skill_slug = serializers.SlugRelatedField(
        source="skill", slug_field="slug", read_only=True
    )

    class Meta:
        model = WorkflowNode
        fields = [
            "id",
            "node_type",
            "sub_agent",
            "sub_agent_slug",
            "skill",
            "skill_slug",
            "position_x",
            "position_y",
            "config_overrides",
            "order",
        ]
        read_only_fields = fields


class WorkflowEdgeListSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowEdge
        fields = ["id", "source_node", "target_node"]
        read_only_fields = fields


class WorkflowListSerializer(serializers.ModelSerializer):
    nodes_count = serializers.IntegerField(source="nodes.count", read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "is_active",
            "organization",
            "project",
            "issue",
            "label",
            "nodes_count",
            "created_at",
        ]
        read_only_fields = fields


class WorkflowDetailSerializer(serializers.ModelSerializer):
    created_by = UserDetailSerializer(read_only=True)
    nodes = WorkflowNodeListSerializer(many=True, read_only=True)
    edges = WorkflowEdgeListSerializer(many=True, read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "is_active",
            "organization",
            "project",
            "issue",
            "label",
            "created_by",
            "nodes",
            "edges",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
```

**Step 9: Create `backend/workflows/views/workflow_views.py`**

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from organizations.models import Organization
from projects.models import Issue, Project
from workspace.models import Label
from workflows.selectors import get_workflow_by_id, list_workflows
from workflows.serializers.input import CreateWorkflowSerializer, UpdateWorkflowSerializer
from workflows.serializers.output import WorkflowDetailSerializer, WorkflowListSerializer
from workflows.services import create_workflow, delete_workflow, update_workflow


class WorkflowListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        workflows = list_workflows()
        return self.paginate(workflows, WorkflowListSerializer, request)

    def post(self, request):
        serializer = CreateWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Resolve FK UUIDs to objects
        kwargs = {}
        if data.get("organization"):
            org = Organization.objects.filter(id=data["organization"]).first()
            if not org:
                return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["organization"] = org
        if data.get("project"):
            proj = Project.objects.filter(id=data["project"]).first()
            if not proj:
                return Response({"detail": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["project"] = proj
        if data.get("issue"):
            iss = Issue.objects.filter(id=data["issue"]).first()
            if not iss:
                return Response({"detail": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["issue"] = iss
        if data.get("label"):
            lbl = Label.objects.filter(id=data["label"]).first()
            if not lbl:
                return Response({"detail": "Label not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["label"] = lbl

        if data.get("description"):
            kwargs["description"] = data["description"]
        kwargs["is_active"] = data.get("is_active", True)

        workflow = create_workflow(
            created_by=request.user,
            name=data["name"],
            slug=data["slug"],
            **kwargs,
        )
        output = WorkflowDetailSerializer(workflow).data
        return Response(output, status=status.HTTP_201_CREATED)


class WorkflowDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        output = WorkflowDetailSerializer(workflow).data
        return Response(output)

    def patch(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "label" in data:
            label_id = data.pop("label")
            if label_id:
                lbl = Label.objects.filter(id=label_id).first()
                if not lbl:
                    return Response({"detail": "Label not found."}, status=status.HTTP_404_NOT_FOUND)
                data["label"] = lbl
            else:
                data["label"] = None

        workflow = update_workflow(workflow, **data)
        output = WorkflowDetailSerializer(workflow).data
        return Response(output)

    def delete(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        delete_workflow(workflow)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 10: Update `backend/workflows/views/__init__.py`**

```python
from workflows.views.workflow_views import WorkflowDetailView, WorkflowListCreateView

__all__ = [
    "WorkflowListCreateView",
    "WorkflowDetailView",
]
```

**Step 11: Update `backend/workflows/urls.py`**

```python
from django.urls import path

from workflows.views import WorkflowDetailView, WorkflowListCreateView

app_name = "workflows"

urlpatterns = [
    path("workflows/", WorkflowListCreateView.as_view(), name="workflow-list-create"),
    path("workflows/<uuid:workflow_id>/", WorkflowDetailView.as_view(), name="workflow-detail"),
]
```

**Step 12: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_workflows.py -v`
Expected: All 8 tests PASS

**Step 13: Run full test suite**

Run: `docker compose exec backend pytest -v`
Expected: All existing tests still pass

**Step 14: Commit**

```bash
git add backend/workflows/ backend/tests/test_workflows.py
git commit -m "feat(workflows): add Workflow CRUD API with tests"
```

---

### Task 5: WorkflowNode CRUD endpoints (TDD)

**Files:**
- Create: `backend/workflows/selectors/node_selector.py`
- Create: `backend/workflows/services/node_service.py`
- Modify: `backend/workflows/selectors/__init__.py`
- Modify: `backend/workflows/services/__init__.py`
- Modify: `backend/workflows/serializers/input.py`
- Create: `backend/workflows/views/node_views.py`
- Modify: `backend/workflows/views/__init__.py`
- Modify: `backend/workflows/urls.py`
- Modify: `backend/tests/test_workflows.py`

**Step 1: Add node tests to `backend/tests/test_workflows.py`**

```python
from tests.factories import SubAgentFactory, SkillFactory, WorkflowNodeFactory


def nodes_url(workflow_id):
    return f"/api/workflows/{workflow_id}/nodes/"


def node_url(workflow_id, node_id):
    return f"/api/workflows/{workflow_id}/nodes/{node_id}/"


class TestWorkflowNodeList:
    def test_list_nodes(self, authenticated_client, workflow):
        WorkflowNodeFactory(workflow=workflow)
        response = authenticated_client.get(nodes_url(workflow.id))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_create_subagent_node(self, authenticated_client, workflow, sub_agent):
        data = {
            "node_type": "SUBAGENT",
            "sub_agent": str(sub_agent.id),
            "position_x": 100.0,
            "position_y": 200.0,
        }
        response = authenticated_client.post(nodes_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["node_type"] == "SUBAGENT"
        assert response.data["sub_agent"] == str(sub_agent.id)

    def test_create_skill_node(self, authenticated_client, workflow, skill):
        data = {
            "node_type": "SKILL",
            "skill": str(skill.id),
            "position_x": 300.0,
            "position_y": 400.0,
        }
        response = authenticated_client.post(nodes_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["node_type"] == "SKILL"

    def test_create_node_workflow_not_found(self, authenticated_client, sub_agent):
        data = {"node_type": "SUBAGENT", "sub_agent": str(sub_agent.id)}
        response = authenticated_client.post(nodes_url(FAKE_UUID), data, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestWorkflowNodeDetail:
    def test_update_node_position(self, authenticated_client, workflow):
        node = WorkflowNodeFactory(workflow=workflow)
        data = {"position_x": 500.0, "position_y": 600.0}
        response = authenticated_client.patch(
            node_url(workflow.id, node.id), data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["position_x"] == 500.0

    def test_delete_node(self, authenticated_client, workflow):
        node = WorkflowNodeFactory(workflow=workflow)
        response = authenticated_client.delete(node_url(workflow.id, node.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_workflows.py::TestWorkflowNodeList -v`
Expected: FAIL

**Step 3: Create `backend/workflows/selectors/node_selector.py`**

```python
from workflows.models import WorkflowNode


def list_workflow_nodes(workflow):
    return WorkflowNode.objects.filter(
        workflow=workflow,
    ).select_related("sub_agent", "skill").order_by("order", "created_at")


def get_workflow_node_by_id(workflow, node_id):
    return WorkflowNode.objects.filter(
        workflow=workflow, id=node_id,
    ).select_related("sub_agent", "skill").first()
```

**Step 4: Create `backend/workflows/services/node_service.py`**

```python
from workflows.models import WorkflowNode


def create_workflow_node(workflow, node_type, **kwargs):
    return WorkflowNode.objects.create(
        workflow=workflow,
        node_type=node_type,
        **kwargs,
    )


def update_workflow_node(node, **kwargs):
    allowed_fields = {"position_x", "position_y", "config_overrides", "order"}

    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(node, field, value)

    node.save()
    return node


def delete_workflow_node(node):
    node.delete()
```

**Step 5: Update `backend/workflows/selectors/__init__.py`**

```python
from workflows.selectors.workflow_selector import (
    get_workflow_by_id,
    list_workflows,
)
from workflows.selectors.node_selector import (
    get_workflow_node_by_id,
    list_workflow_nodes,
)

__all__ = [
    "get_workflow_by_id",
    "list_workflows",
    "get_workflow_node_by_id",
    "list_workflow_nodes",
]
```

**Step 6: Update `backend/workflows/services/__init__.py`**

```python
from workflows.services.workflow_service import (
    create_workflow,
    delete_workflow,
    update_workflow,
)
from workflows.services.node_service import (
    create_workflow_node,
    delete_workflow_node,
    update_workflow_node,
)

__all__ = [
    "create_workflow",
    "delete_workflow",
    "update_workflow",
    "create_workflow_node",
    "delete_workflow_node",
    "update_workflow_node",
]
```

**Step 7: Add input serializers to `backend/workflows/serializers/input.py`**

Append:

```python
from workflows.models.workflow_node import WorkflowNodeType


class CreateWorkflowNodeSerializer(serializers.Serializer):
    node_type = serializers.ChoiceField(choices=WorkflowNodeType.choices)
    sub_agent = serializers.UUIDField(required=False, allow_null=True)
    skill = serializers.UUIDField(required=False, allow_null=True)
    position_x = serializers.FloatField(required=False, default=0)
    position_y = serializers.FloatField(required=False, default=0)
    config_overrides = serializers.JSONField(required=False, default=dict)
    order = serializers.IntegerField(required=False, default=0)

    def validate(self, attrs):
        node_type = attrs.get("node_type")
        if node_type == "SUBAGENT" and not attrs.get("sub_agent"):
            raise serializers.ValidationError(
                {"sub_agent": "Required when node_type is SUBAGENT."}
            )
        if node_type == "SKILL" and not attrs.get("skill"):
            raise serializers.ValidationError(
                {"skill": "Required when node_type is SKILL."}
            )
        return attrs


class UpdateWorkflowNodeSerializer(serializers.Serializer):
    position_x = serializers.FloatField(required=False)
    position_y = serializers.FloatField(required=False)
    config_overrides = serializers.JSONField(required=False)
    order = serializers.IntegerField(required=False)
```

**Step 8: Create `backend/workflows/views/node_views.py`**

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from agents.models import SubAgent, Skill
from workflows.selectors import get_workflow_by_id, get_workflow_node_by_id, list_workflow_nodes
from workflows.serializers.input import CreateWorkflowNodeSerializer, UpdateWorkflowNodeSerializer
from workflows.serializers.output import WorkflowNodeListSerializer
from workflows.services import create_workflow_node, delete_workflow_node, update_workflow_node


class WorkflowNodeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)
        nodes = list_workflow_nodes(workflow)
        output = WorkflowNodeListSerializer(nodes, many=True).data
        return Response(output)

    def post(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CreateWorkflowNodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        kwargs = {
            "position_x": data.get("position_x", 0),
            "position_y": data.get("position_y", 0),
            "config_overrides": data.get("config_overrides", {}),
            "order": data.get("order", 0),
        }

        if data.get("sub_agent"):
            sa = SubAgent.objects.filter(id=data["sub_agent"]).first()
            if not sa:
                return Response({"detail": "SubAgent not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["sub_agent"] = sa

        if data.get("skill"):
            sk = Skill.objects.filter(id=data["skill"]).first()
            if not sk:
                return Response({"detail": "Skill not found."}, status=status.HTTP_404_NOT_FOUND)
            kwargs["skill"] = sk

        node = create_workflow_node(workflow, data["node_type"], **kwargs)
        output = WorkflowNodeListSerializer(node).data
        return Response(output, status=status.HTTP_201_CREATED)


class WorkflowNodeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, workflow_id, node_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        node = get_workflow_node_by_id(workflow, node_id)
        if not node:
            return Response({"detail": "Node not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateWorkflowNodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        node = update_workflow_node(node, **serializer.validated_data)
        output = WorkflowNodeListSerializer(node).data
        return Response(output)

    def delete(self, request, workflow_id, node_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        node = get_workflow_node_by_id(workflow, node_id)
        if not node:
            return Response({"detail": "Node not found."}, status=status.HTTP_404_NOT_FOUND)

        delete_workflow_node(node)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 9: Update `backend/workflows/views/__init__.py`**

```python
from workflows.views.workflow_views import WorkflowDetailView, WorkflowListCreateView
from workflows.views.node_views import WorkflowNodeDetailView, WorkflowNodeListCreateView

__all__ = [
    "WorkflowListCreateView",
    "WorkflowDetailView",
    "WorkflowNodeListCreateView",
    "WorkflowNodeDetailView",
]
```

**Step 10: Update `backend/workflows/urls.py`**

```python
from django.urls import path

from workflows.views import (
    WorkflowDetailView,
    WorkflowListCreateView,
    WorkflowNodeDetailView,
    WorkflowNodeListCreateView,
)

app_name = "workflows"

urlpatterns = [
    path("workflows/", WorkflowListCreateView.as_view(), name="workflow-list-create"),
    path("workflows/<uuid:workflow_id>/", WorkflowDetailView.as_view(), name="workflow-detail"),
    path("workflows/<uuid:workflow_id>/nodes/", WorkflowNodeListCreateView.as_view(), name="workflow-node-list-create"),
    path("workflows/<uuid:workflow_id>/nodes/<uuid:node_id>/", WorkflowNodeDetailView.as_view(), name="workflow-node-detail"),
]
```

**Step 11: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_workflows.py -v`
Expected: All tests PASS (Workflow CRUD + Node CRUD)

**Step 12: Commit**

```bash
git add backend/workflows/ backend/tests/test_workflows.py
git commit -m "feat(workflows): add WorkflowNode CRUD API with tests"
```

---

### Task 6: WorkflowEdge CRUD with DAG validation (TDD)

**Files:**
- Create: `backend/workflows/selectors/edge_selector.py`
- Create: `backend/workflows/services/edge_service.py`
- Modify: `backend/workflows/selectors/__init__.py`
- Modify: `backend/workflows/services/__init__.py`
- Modify: `backend/workflows/serializers/input.py`
- Create: `backend/workflows/views/edge_views.py`
- Modify: `backend/workflows/views/__init__.py`
- Modify: `backend/workflows/urls.py`
- Modify: `backend/tests/test_workflows.py`

**Step 1: Add edge tests to `backend/tests/test_workflows.py`**

```python
from tests.factories import WorkflowEdgeFactory


def edges_url(workflow_id):
    return f"/api/workflows/{workflow_id}/edges/"


def edge_url(workflow_id, edge_id):
    return f"/api/workflows/{workflow_id}/edges/{edge_id}/"


class TestWorkflowEdgeList:
    def test_list_edges(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        WorkflowEdgeFactory(workflow=workflow, source_node=n1, target_node=n2)
        response = authenticated_client.get(edges_url(workflow.id))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_create_edge(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        data = {"source_node": str(n1.id), "target_node": str(n2.id)}
        response = authenticated_client.post(edges_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_create_edge_cycle_rejected(self, authenticated_client, workflow):
        """Creating an edge that forms a cycle should fail."""
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        # Create n1 → n2
        WorkflowEdgeFactory(workflow=workflow, source_node=n1, target_node=n2)
        # Try to create n2 → n1 (cycle)
        data = {"source_node": str(n2.id), "target_node": str(n1.id)}
        response = authenticated_client.post(edges_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "cycle" in response.data["detail"].lower()

    def test_create_edge_self_loop_rejected(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        data = {"source_node": str(n1.id), "target_node": str(n1.id)}
        response = authenticated_client.post(edges_url(workflow.id), data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestWorkflowEdgeDetail:
    def test_delete_edge(self, authenticated_client, workflow):
        n1 = WorkflowNodeFactory(workflow=workflow, order=0)
        n2 = WorkflowNodeFactory(workflow=workflow, order=1)
        edge = WorkflowEdgeFactory(workflow=workflow, source_node=n1, target_node=n2)
        response = authenticated_client.delete(edge_url(workflow.id, edge.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_workflows.py::TestWorkflowEdgeList -v`
Expected: FAIL

**Step 3: Create `backend/workflows/services/edge_service.py`**

```python
from collections import defaultdict

from rest_framework.exceptions import ValidationError

from workflows.models import WorkflowEdge


def _has_cycle(workflow, new_source_id, new_target_id):
    """Check if adding an edge would create a cycle using DFS."""
    adj = defaultdict(list)
    for edge in WorkflowEdge.objects.filter(workflow=workflow):
        adj[str(edge.source_node_id)].append(str(edge.target_node_id))

    # Add the proposed edge
    adj[str(new_source_id)].append(str(new_target_id))

    visited = set()
    in_stack = set()

    def dfs(node):
        visited.add(node)
        in_stack.add(node)
        for neighbor in adj[node]:
            if neighbor in in_stack:
                return True
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
        in_stack.discard(node)
        return False

    for node in list(adj.keys()):
        if node not in visited:
            if dfs(node):
                return True
    return False


def create_workflow_edge(workflow, source_node, target_node):
    if source_node.id == target_node.id:
        raise ValidationError({"detail": "Self-loops are not allowed."})

    if source_node.workflow_id != workflow.id or target_node.workflow_id != workflow.id:
        raise ValidationError({"detail": "Both nodes must belong to the same workflow."})

    if _has_cycle(workflow, source_node.id, target_node.id):
        raise ValidationError({"detail": "Adding this edge would create a cycle in the workflow."})

    return WorkflowEdge.objects.create(
        workflow=workflow,
        source_node=source_node,
        target_node=target_node,
    )


def delete_workflow_edge(edge):
    edge.delete()
```

**Step 4: Create `backend/workflows/selectors/edge_selector.py`**

```python
from workflows.models import WorkflowEdge


def list_workflow_edges(workflow):
    return WorkflowEdge.objects.filter(workflow=workflow)


def get_workflow_edge_by_id(workflow, edge_id):
    return WorkflowEdge.objects.filter(workflow=workflow, id=edge_id).first()
```

**Step 5: Update `backend/workflows/selectors/__init__.py`**

Add:

```python
from workflows.selectors.edge_selector import (
    get_workflow_edge_by_id,
    list_workflow_edges,
)
```

Add to `__all__`: `"get_workflow_edge_by_id"`, `"list_workflow_edges"`.

**Step 6: Update `backend/workflows/services/__init__.py`**

Add:

```python
from workflows.services.edge_service import (
    create_workflow_edge,
    delete_workflow_edge,
)
```

Add to `__all__`: `"create_workflow_edge"`, `"delete_workflow_edge"`.

**Step 7: Add edge input serializer to `backend/workflows/serializers/input.py`**

Append:

```python
class CreateWorkflowEdgeSerializer(serializers.Serializer):
    source_node = serializers.UUIDField()
    target_node = serializers.UUIDField()
```

**Step 8: Create `backend/workflows/views/edge_views.py`**

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from workflows.selectors import (
    get_workflow_by_id,
    get_workflow_edge_by_id,
    get_workflow_node_by_id,
    list_workflow_edges,
)
from workflows.serializers.input import CreateWorkflowEdgeSerializer
from workflows.serializers.output import WorkflowEdgeListSerializer
from workflows.services import create_workflow_edge, delete_workflow_edge


class WorkflowEdgeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)
        edges = list_workflow_edges(workflow)
        output = WorkflowEdgeListSerializer(edges, many=True).data
        return Response(output)

    def post(self, request, workflow_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CreateWorkflowEdgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        source = get_workflow_node_by_id(workflow, data["source_node"])
        if not source:
            return Response({"detail": "Source node not found."}, status=status.HTTP_404_NOT_FOUND)

        target = get_workflow_node_by_id(workflow, data["target_node"])
        if not target:
            return Response({"detail": "Target node not found."}, status=status.HTTP_404_NOT_FOUND)

        edge = create_workflow_edge(workflow, source, target)
        output = WorkflowEdgeListSerializer(edge).data
        return Response(output, status=status.HTTP_201_CREATED)


class WorkflowEdgeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, workflow_id, edge_id):
        workflow = get_workflow_by_id(workflow_id)
        if not workflow:
            return Response({"detail": "Workflow not found."}, status=status.HTTP_404_NOT_FOUND)

        edge = get_workflow_edge_by_id(workflow, edge_id)
        if not edge:
            return Response({"detail": "Edge not found."}, status=status.HTTP_404_NOT_FOUND)

        delete_workflow_edge(edge)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 9: Update `backend/workflows/views/__init__.py`**

Add:

```python
from workflows.views.edge_views import WorkflowEdgeDetailView, WorkflowEdgeListCreateView
```

Add to `__all__`: `"WorkflowEdgeListCreateView"`, `"WorkflowEdgeDetailView"`.

**Step 10: Update `backend/workflows/urls.py`**

Add edge URL patterns:

```python
    path("workflows/<uuid:workflow_id>/edges/", WorkflowEdgeListCreateView.as_view(), name="workflow-edge-list-create"),
    path("workflows/<uuid:workflow_id>/edges/<uuid:edge_id>/", WorkflowEdgeDetailView.as_view(), name="workflow-edge-detail"),
```

**Step 11: Run tests**

Run: `docker compose exec backend pytest tests/test_workflows.py -v`
Expected: All tests PASS

**Step 12: Run full test suite**

Run: `docker compose exec backend pytest -v`
Expected: All tests PASS

**Step 13: Commit**

```bash
git add backend/workflows/ backend/tests/test_workflows.py
git commit -m "feat(workflows): add WorkflowEdge CRUD with DAG cycle detection"
```

---

### Task 7: Workflow resolution selector (TDD)

**Files:**
- Create: `backend/workflows/selectors/resolve_selector.py`
- Modify: `backend/workflows/selectors/__init__.py`
- Create: `backend/workflows/views/resolve_views.py`
- Modify: `backend/workflows/views/__init__.py`
- Modify: `backend/workflows/urls.py`
- Modify: `backend/tests/test_workflows.py`

**Step 1: Add resolve tests to `backend/tests/test_workflows.py`**

```python
def resolve_url(issue_id):
    return f"/api/workflows/resolve/{issue_id}/"


class TestWorkflowResolve:
    def test_resolve_global_default(self, authenticated_client, issue, user):
        """Global workflow with no label matches any issue."""
        wf = WorkflowFactory(created_by=user, is_active=True)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf.id)

    def test_resolve_project_over_global(self, authenticated_client, project, issue, user):
        """Project-scoped workflow takes priority over global."""
        WorkflowFactory(created_by=user, is_active=True)  # global
        wf_proj = WorkflowFactory(created_by=user, project=project, is_active=True)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf_proj.id)

    def test_resolve_by_label(self, authenticated_client, issue, user):
        """Label-matched workflow beats default."""
        label = LabelFactory()
        issue.labels.add(label)
        WorkflowFactory(created_by=user, is_active=True)  # default
        wf_label = WorkflowFactory(created_by=user, label=label, is_active=True)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf_label.id)

    def test_resolve_label_fallback_to_default(self, authenticated_client, issue, user):
        """If no label-matched workflow, falls back to default."""
        label = LabelFactory()
        issue.labels.add(label)
        wf_default = WorkflowFactory(created_by=user, is_active=True)  # no label
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(wf_default.id)

    def test_resolve_inactive_skipped(self, authenticated_client, issue, user):
        """Inactive workflows are skipped."""
        WorkflowFactory(created_by=user, is_active=False)
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_resolve_no_workflow(self, authenticated_client, issue):
        """No matching workflow returns 404."""
        response = authenticated_client.get(resolve_url(issue.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_resolve_issue_not_found(self, authenticated_client):
        response = authenticated_client.get(resolve_url(FAKE_UUID))
        assert response.status_code == status.HTTP_404_NOT_FOUND
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_workflows.py::TestWorkflowResolve -v`
Expected: FAIL

**Step 3: Create `backend/workflows/selectors/resolve_selector.py`**

```python
from workflows.models import Workflow


def _find_active_workflow(scope_filter, label=None):
    """Find an active workflow matching a scope filter and optional label."""
    qs = Workflow.objects.filter(is_active=True, **scope_filter)
    if label:
        qs = qs.filter(label=label)
    else:
        qs = qs.filter(label__isnull=True)
    return (
        qs.select_related("organization", "project", "issue", "label", "created_by")
        .prefetch_related("nodes__sub_agent", "nodes__skill", "edges")
        .first()
    )


def resolve_workflow_for_issue(issue):
    """
    Resolve the best workflow for an issue.

    Resolution order:
    1. Pass 1: For each issue label (in order), check scopes Issue → Project → Org → Global
    2. Pass 2: Check default (no label) at each scope
    """
    project = issue.project
    organization = project.organization

    scopes = [
        {"issue": issue},
        {"project": project},
        {"organization": organization},
        {"organization__isnull": True, "project__isnull": True, "issue__isnull": True},
    ]

    # Pass 1: Match by label
    labels = list(issue.labels.all().order_by("name"))
    for label in labels:
        for scope_filter in scopes:
            workflow = _find_active_workflow(scope_filter, label=label)
            if workflow:
                return workflow

    # Pass 2: Default (no label)
    for scope_filter in scopes:
        workflow = _find_active_workflow(scope_filter, label=None)
        if workflow:
            return workflow

    return None
```

**Step 4: Update `backend/workflows/selectors/__init__.py`**

Add:

```python
from workflows.selectors.resolve_selector import resolve_workflow_for_issue
```

Add to `__all__`: `"resolve_workflow_for_issue"`.

**Step 5: Create `backend/workflows/views/resolve_views.py`**

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.models import Issue
from workflows.selectors import resolve_workflow_for_issue
from workflows.serializers.output import WorkflowDetailSerializer


class WorkflowResolveView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, issue_id):
        issue = Issue.objects.filter(id=issue_id).select_related(
            "project__organization",
        ).prefetch_related("labels").first()

        if not issue:
            return Response({"detail": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        workflow = resolve_workflow_for_issue(issue)
        if not workflow:
            return Response(
                {"detail": "No workflow found for this issue."},
                status=status.HTTP_404_NOT_FOUND,
            )

        output = WorkflowDetailSerializer(workflow).data
        return Response(output)
```

**Step 6: Update views `__init__.py` and `urls.py`**

Add to `__init__.py`:

```python
from workflows.views.resolve_views import WorkflowResolveView
```

Add to `urls.py`:

```python
    path("workflows/resolve/<uuid:issue_id>/", WorkflowResolveView.as_view(), name="workflow-resolve"),
```

**Step 7: Run tests**

Run: `docker compose exec backend pytest tests/test_workflows.py -v`
Expected: All tests PASS

**Step 8: Run full test suite**

Run: `docker compose exec backend pytest -v`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add backend/workflows/ backend/tests/test_workflows.py
git commit -m "feat(workflows): add workflow resolution algorithm for issues"
```

---

### Task 8: YAML serialization for the resolve endpoint

**Files:**
- Modify: `backend/workflows/views/resolve_views.py`
- Modify: `backend/tests/test_workflows.py`

**Step 1: Add YAML response test to `backend/tests/test_workflows.py`**

```python
class TestWorkflowResolveYAML:
    def test_resolve_returns_yaml_with_format_param(
        self, authenticated_client, project, issue, user
    ):
        """When ?format=yaml, returns YAML string."""
        wf = WorkflowFactory(created_by=user, project=project, is_active=True)
        sa = SubAgentFactory(created_by=user)
        sk = SkillFactory(created_by=user)
        n1 = WorkflowNodeFactory(
            workflow=wf, node_type="SUBAGENT", sub_agent=sa, skill=None, order=0
        )
        n2 = WorkflowNodeFactory(
            workflow=wf, node_type="SKILL", skill=sk, sub_agent=None, order=1
        )
        WorkflowEdgeFactory(workflow=wf, source_node=n1, target_node=n2)

        response = authenticated_client.get(resolve_url(issue.id) + "?format=yaml")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "text/yaml"
        # Response body should be valid YAML containing node slugs
        import yaml
        data = yaml.safe_load(response.content)
        assert data["name"] == wf.name
        assert len(data["nodes"]) == 2
        # Second node should depend on first
        node_with_deps = [n for n in data["nodes"] if "depends_on" in n]
        assert len(node_with_deps) == 1
```

**Step 2: Run test to verify it fails**

Run: `docker compose exec backend pytest tests/test_workflows.py::TestWorkflowResolveYAML -v`
Expected: FAIL

**Step 3: Update `backend/workflows/views/resolve_views.py`**

Add YAML serialization support:

```python
from collections import defaultdict

import yaml
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.models import Issue
from workflows.selectors import resolve_workflow_for_issue
from workflows.serializers.output import WorkflowDetailSerializer


def _workflow_to_yaml(workflow):
    """Serialize a workflow to YAML string for the executor."""
    # Build adjacency: target_node_id → list of source slug IDs
    edge_map = defaultdict(list)
    node_id_to_slug = {}

    for node in workflow.nodes.all():
        ref = node.sub_agent or node.skill
        slug = ref.slug if ref else str(node.id)
        node_id_to_slug[str(node.id)] = slug

    for edge in workflow.edges.all():
        source_slug = node_id_to_slug.get(str(edge.source_node_id))
        target_id = str(edge.target_node_id)
        edge_map[target_id].append(source_slug)

    nodes = []
    for node in workflow.nodes.all().order_by("order", "created_at"):
        ref = node.sub_agent or node.skill
        slug = ref.slug if ref else str(node.id)
        entry = {
            "id": slug,
            "type": node.node_type.lower(),
            "slug": slug,
        }
        if node.config_overrides:
            entry["config_overrides"] = node.config_overrides
        deps = edge_map.get(str(node.id))
        if deps:
            entry["depends_on"] = deps
        nodes.append(entry)

    data = {
        "name": workflow.name,
        "slug": workflow.slug,
        "description": workflow.description,
        "nodes": nodes,
    }
    return yaml.dump(data, default_flow_style=False, sort_keys=False)


class WorkflowResolveView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, issue_id):
        issue = Issue.objects.filter(id=issue_id).select_related(
            "project__organization",
        ).prefetch_related("labels").first()

        if not issue:
            return Response({"detail": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        workflow = resolve_workflow_for_issue(issue)
        if not workflow:
            return Response(
                {"detail": "No workflow found for this issue."},
                status=status.HTTP_404_NOT_FOUND,
            )

        fmt = request.query_params.get("format")
        if fmt == "yaml":
            yaml_content = _workflow_to_yaml(workflow)
            return HttpResponse(yaml_content, content_type="text/yaml")

        output = WorkflowDetailSerializer(workflow).data
        return Response(output)
```

**Step 4: Run tests**

Run: `docker compose exec backend pytest tests/test_workflows.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/workflows/ backend/tests/test_workflows.py
git commit -m "feat(workflows): add YAML serialization for workflow resolve endpoint"
```

---

### Task 9: MCP tool — get_issue_workflow

**Files:**
- Modify: `mcp-server/src/toony_mcp/client.py`
- Create: `mcp-server/src/toony_mcp/tools/workflows.py`
- Modify: `mcp-server/src/toony_mcp/server.py` (if tools are auto-registered) or register new module

**Step 1: Add client method to `mcp-server/src/toony_mcp/client.py`**

Add at the end of the class:

```python
    # -- Workflows --
    def resolve_issue_workflow(self, issue_id: str) -> dict | str:
        """Get the resolved workflow for an issue. Returns YAML when format=yaml."""
        return self._get(f"/workflows/resolve/{issue_id}/", params={"format": "yaml"})
```

Note: Since the YAML endpoint returns text, update `_request` to handle text/yaml responses. Check how `_request` works — if `response.json()` fails on YAML, we need to handle that. Looking at the client's `_request`, it calls `response.json()` which will fail for YAML. So we need to return the raw text for YAML:

Actually, for the MCP tool, we want the YAML string directly. Update the client method:

```python
    def resolve_issue_workflow_yaml(self, issue_id: str) -> str:
        """Get the resolved workflow YAML for an issue."""
        url = f"{self.api_url}/workflows/resolve/{issue_id}/"
        response = self.session.get(url, params={"format": "yaml"})
        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            return json.dumps({"error": f"HTTP {response.status_code}", "detail": detail})
        return response.text
```

Add `import json` at top of client.py if not already present.

**Step 2: Create `mcp-server/src/toony_mcp/tools/workflows.py`**

```python
from toony_mcp.server import get_client, mcp


@mcp.tool()
def get_issue_workflow(issue_id: str) -> str:
    """Get the resolved workflow for an issue as YAML.

    Resolves the best matching workflow for the given issue based on:
    1. Issue labels (matched against workflow label requirements)
    2. Scope priority: Issue > Project > Organization > Global

    Returns a YAML string describing the workflow DAG with nodes
    (subagents/skills) and their dependencies.

    Args:
        issue_id: The UUID of the issue to resolve workflow for
    """
    client = get_client()
    return client.resolve_issue_workflow_yaml(issue_id)
```

**Step 3: Register the new tools module**

Check how other tool modules are imported. Read `mcp-server/src/toony_mcp/server.py` to find the import pattern. The tools are likely imported at the bottom or in `__init__.py`. Add:

```python
import toony_mcp.tools.workflows  # noqa: F401
```

alongside the other tool imports.

**Step 4: Verify the MCP server starts**

Run: `cd mcp-server && pip install -e . && python -c "from toony_mcp.tools.workflows import get_issue_workflow; print('OK')"`
Expected: `OK`

**Step 5: Commit**

```bash
git add mcp-server/
git commit -m "feat(mcp): add get_issue_workflow tool"
```

---

### Task 10: Frontend — TypeScript types and API module

**Files:**
- Modify: `frontend/types/agents.ts` (or create `frontend/types/workflows.ts`)
- Create: `frontend/lib/api/workflows.ts`

**Step 1: Create `frontend/types/workflows.ts`**

```typescript
export interface WorkflowNodeData {
  id: string;
  node_type: "SUBAGENT" | "SKILL";
  sub_agent: string | null;
  sub_agent_slug: string | null;
  skill: string | null;
  skill_slug: string | null;
  position_x: number;
  position_y: number;
  config_overrides: Record<string, unknown>;
  order: number;
}

export interface WorkflowEdgeData {
  id: string;
  source_node: string;
  target_node: string;
}

export interface WorkflowList {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  organization: string | null;
  project: string | null;
  issue: string | null;
  label: string | null;
  nodes_count: number;
  created_at: string;
}

export interface WorkflowDetail extends WorkflowList {
  created_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
  nodes: WorkflowNodeData[];
  edges: WorkflowEdgeData[];
  updated_at: string;
}

export interface CreateWorkflowPayload {
  name: string;
  slug: string;
  description?: string;
  is_active?: boolean;
  organization?: string;
  project?: string;
  issue?: string;
  label?: string;
}

export interface UpdateWorkflowPayload {
  name?: string;
  description?: string;
  is_active?: boolean;
  label?: string | null;
}

export interface CreateNodePayload {
  node_type: "SUBAGENT" | "SKILL";
  sub_agent?: string;
  skill?: string;
  position_x?: number;
  position_y?: number;
  config_overrides?: Record<string, unknown>;
  order?: number;
}

export interface UpdateNodePayload {
  position_x?: number;
  position_y?: number;
  config_overrides?: Record<string, unknown>;
  order?: number;
}

export interface CreateEdgePayload {
  source_node: string;
  target_node: string;
}
```

**Step 2: Create `frontend/lib/api/workflows.ts`**

```typescript
import api from "@/lib/api";
import type {
  WorkflowList,
  WorkflowDetail,
  WorkflowNodeData,
  WorkflowEdgeData,
  CreateWorkflowPayload,
  UpdateWorkflowPayload,
  CreateNodePayload,
  UpdateNodePayload,
  CreateEdgePayload,
} from "@/types/workflows";
import type { PaginatedResponse } from "@/types";

export async function listWorkflows(
  cursor?: string
): Promise<PaginatedResponse<WorkflowList>> {
  const params = cursor ? { cursor } : {};
  const { data } = await api.get("/workflows/", { params });
  return data;
}

export async function getWorkflow(id: string): Promise<WorkflowDetail> {
  const { data } = await api.get(`/workflows/${id}/`);
  return data;
}

export async function createWorkflow(
  payload: CreateWorkflowPayload
): Promise<WorkflowDetail> {
  const { data } = await api.post("/workflows/", payload);
  return data;
}

export async function updateWorkflow(
  id: string,
  payload: UpdateWorkflowPayload
): Promise<WorkflowDetail> {
  const { data } = await api.patch(`/workflows/${id}/`, payload);
  return data;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await api.delete(`/workflows/${id}/`);
}

// Nodes
export async function listNodes(workflowId: string): Promise<WorkflowNodeData[]> {
  const { data } = await api.get(`/workflows/${workflowId}/nodes/`);
  return data;
}

export async function createNode(
  workflowId: string,
  payload: CreateNodePayload
): Promise<WorkflowNodeData> {
  const { data } = await api.post(`/workflows/${workflowId}/nodes/`, payload);
  return data;
}

export async function updateNode(
  workflowId: string,
  nodeId: string,
  payload: UpdateNodePayload
): Promise<WorkflowNodeData> {
  const { data } = await api.patch(
    `/workflows/${workflowId}/nodes/${nodeId}/`,
    payload
  );
  return data;
}

export async function deleteNode(
  workflowId: string,
  nodeId: string
): Promise<void> {
  await api.delete(`/workflows/${workflowId}/nodes/${nodeId}/`);
}

// Edges
export async function listEdges(workflowId: string): Promise<WorkflowEdgeData[]> {
  const { data } = await api.get(`/workflows/${workflowId}/edges/`);
  return data;
}

export async function createEdge(
  workflowId: string,
  payload: CreateEdgePayload
): Promise<WorkflowEdgeData> {
  const { data } = await api.post(`/workflows/${workflowId}/edges/`, payload);
  return data;
}

export async function deleteEdge(
  workflowId: string,
  edgeId: string
): Promise<void> {
  await api.delete(`/workflows/${workflowId}/edges/${edgeId}/`);
}
```

**Step 3: Commit**

```bash
git add frontend/types/workflows.ts frontend/lib/api/workflows.ts
git commit -m "feat(frontend): add Workflow types and API module"
```

---

### Task 11: Frontend — Sidebar update and Workflows list page

**Files:**
- Modify: `frontend/components/sidebar.tsx` — Add Workflows item to AI Studio
- Create: `frontend/app/(dashboard)/workflows/page.tsx`

**Step 1: Add Workflows to sidebar**

In `frontend/components/sidebar.tsx`, find the AI Studio children array and add a "Workflows" entry after "Skills":

```typescript
{ label: "Workflows", path: "/workflows", icon: /* use a flow/workflow icon */ },
```

Use an appropriate Heroicon or custom SVG (e.g., a branching arrows icon).

**Step 2: Create `frontend/app/(dashboard)/workflows/page.tsx`**

Follow the exact same pattern as `subagents/page.tsx`:
- Header with title "Workflows" and "Add Workflow" button linking to `/workflows/new`
- Filter pills: Active status (ALL, ACTIVE, INACTIVE)
- Scope filter pills: ALL, GLOBAL, ORGANIZATION, PROJECT, ISSUE
- List of workflow cards showing: name, scope badge, label badge, active toggle, node count
- Empty state when no workflows match filters
- Uses `listWorkflows()` from API module

Refer to the SubAgents list page for exact Tailwind classes and layout patterns. Key differences:
- No type/category filter — replaced by scope filter
- Active/Inactive toggle instead of 4-state status
- Show scope badge (derive from org/project/issue fields)
- Show label badge or "Default"
- Show nodes count

**Step 3: Verify the page renders**

Run: `./node_modules/.bin/next build` (or run dev server and navigate to `/workflows`)
Expected: Page renders with empty state or list of workflows

**Step 4: Commit**

```bash
git add frontend/components/sidebar.tsx frontend/app/\(dashboard\)/workflows/
git commit -m "feat(frontend): add Workflows list page in AI Studio"
```

---

### Task 12: Frontend — Workflow create/edit page with DAG editor

**Files:**
- Create: `frontend/app/(dashboard)/workflows/new/page.tsx`
- Create: `frontend/app/(dashboard)/workflows/[id]/edit/page.tsx`

**Step 1: Install @xyflow/react**

The DAG canvas editor will use React Flow (@xyflow/react), a mature library for node-based graph editors.

Run: `cd frontend && npm install @xyflow/react`

**Step 2: Create the workflow editor page**

Create `frontend/app/(dashboard)/workflows/new/page.tsx` with three panels:

**Left panel (w-64):** Catalog of available SubAgents and Skills fetched from the API. Each item is draggable onto the canvas.

**Center canvas (flex-1):** React Flow canvas with:
- Custom node component showing SubAgent/Skill icon + name
- Connection handles (source on bottom, target on top)
- onConnect handler that calls `createEdge()` API
- onNodesChange handler that calls `updateNode()` API for position changes
- onNodeDelete handler that calls `deleteNode()` API
- onEdgeDelete handler that calls `deleteEdge()` API
- Background with dots pattern
- Controls (zoom, fit view)

**Right panel (w-80):** Properties panel showing:
- When no node selected: Workflow properties (name, slug, description, scope selectors, label dropdown, active toggle)
- When a node is selected: Node properties (type, reference name, config overrides JSON editor)

**Data flow:**
1. On page load: create workflow via POST (or load existing for edit page)
2. Drag SubAgent/Skill from catalog → calls `createNode()` → adds to React Flow state
3. Draw connection → calls `createEdge()` → adds edge to React Flow state
4. Move node → debounced `updateNode()` call with new position
5. Delete node/edge → calls respective delete API
6. Edit workflow properties → calls `updateWorkflow()`

**Step 3: Create the edit page**

Create `frontend/app/(dashboard)/workflows/[id]/edit/page.tsx` — same component as new page but loads existing workflow via `getWorkflow(id)` and populates the canvas with existing nodes and edges.

**Step 4: Verify the editor renders**

Run dev server and navigate to `/workflows/new`
Expected: Three-panel layout with empty canvas, catalog on left, properties on right

**Step 5: Lint check**

Run: `cd frontend && ./node_modules/.bin/next lint`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/app/\(dashboard\)/workflows/ frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): add Workflow DAG editor with React Flow"
```

---

### Task 13: Update CLAUDE.md and project memory

**Files:**
- Modify: `CLAUDE.md` — Add workflows app to Architecture section
- Modify: `backend/CLAUDE.md` — Add workflows to field map and API routes

**Step 1: Update root `CLAUDE.md`**

Add `workflows` to the list of Django apps and add the `/workflows` route to the frontend structure.

**Step 2: Update `backend/CLAUDE.md`**

Add to field map:

```markdown
### workflows app
- **Workflow** — `id`, `name`, `slug`, `description`, `is_active` (bool), `organization` → Org?, `project` → Project?, `issue` → Issue?, `label` → Label?, `created_by` → User
- **WorkflowNode** — `workflow` → Workflow, `node_type` (SUBAGENT|SKILL), `sub_agent` → SubAgent?, `skill` → Skill?, `position_x`, `position_y`, `config_overrides` (JSON), `order`
- **WorkflowEdge** — `workflow` → Workflow, `source_node` → WorkflowNode, `target_node` → WorkflowNode
```

Add to API routes:

```markdown
api/workflows/, /workflows/<workflow_id>/
  /nodes/, /nodes/<node_id>/
  /edges/, /edges/<edge_id>/
api/workflows/resolve/<issue_id>/     (GET, ?format=yaml)
```

**Step 3: Commit**

```bash
git add CLAUDE.md backend/CLAUDE.md
git commit -m "docs: add workflows to CLAUDE.md and backend field map"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | App scaffold | `backend/workflows/`, settings, urls |
| 2 | Models + migrations | `models/workflow.py`, `workflow_node.py`, `workflow_edge.py` |
| 3 | Test factories + fixtures | `factories.py`, `conftest.py` |
| 4 | Workflow CRUD (TDD) | selectors, services, serializers, views, tests |
| 5 | Node CRUD (TDD) | node selectors/services/views, tests |
| 6 | Edge CRUD + DAG validation (TDD) | edge service with cycle detection, tests |
| 7 | Resolve algorithm (TDD) | resolve selector, resolve view, tests |
| 8 | YAML serialization | resolve view YAML output, tests |
| 9 | MCP tool | `get_issue_workflow` tool + client method |
| 10 | Frontend types + API | `types/workflows.ts`, `lib/api/workflows.ts` |
| 11 | Frontend list page | `workflows/page.tsx`, sidebar update |
| 12 | Frontend DAG editor | `workflows/new/page.tsx`, `workflows/[id]/edit/page.tsx` |
| 13 | Documentation | CLAUDE.md updates |
