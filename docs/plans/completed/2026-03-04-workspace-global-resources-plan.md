# Global Workspace Resources — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Label, Team, and TeamMembership from org-scoped models to global workspace resources; change Project→Team from required FK to optional M2M.

**Architecture:** Create a new `workspace` Django app housing the global models. Migrate data from `projects` app tables, update API endpoints to `/api/v1/workspace/`, add `ProjectTeam` M2M join table, and rebuild frontend routes/API modules accordingly.

**Tech Stack:** Django 5, DRF, PostgreSQL, Next.js 15, React 19, TypeScript, Tailwind CSS v4

**Design Doc:** `docs/plans/2026-03-04-workspace-global-resources-design.md`

---

## Phase 1: Backend — New `workspace` App (Models + Migration)

### Task 1: Create the `workspace` Django app with global models

**Files:**
- Create: `backend/workspace/__init__.py`
- Create: `backend/workspace/models/__init__.py`
- Create: `backend/workspace/models/label.py`
- Create: `backend/workspace/models/team.py`
- Create: `backend/workspace/models/project_team.py`
- Modify: `backend/config/settings/base.py:30` (INSTALLED_APPS)

**Step 1: Create the workspace app directory structure**

```bash
mkdir -p backend/workspace/models backend/workspace/selectors backend/workspace/services backend/workspace/serializers backend/workspace/views
touch backend/workspace/__init__.py backend/workspace/models/__init__.py backend/workspace/selectors/__init__.py backend/workspace/services/__init__.py backend/workspace/serializers/__init__.py backend/workspace/views/__init__.py
```

**Step 2: Write `backend/workspace/models/label.py`**

```python
from django.db import models

from common.models import BaseModel


class Label(BaseModel):
    name = models.CharField(max_length=255, unique=True)
    color = models.CharField(max_length=7, default="#6b7280")
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "workspace_labels"
        ordering = ["name"]

    def __str__(self):
        return self.name
```

**Step 3: Write `backend/workspace/models/team.py`**

```python
from django.conf import settings
from django.db import models

from common.models import BaseModel


class TeamRole(models.TextChoices):
    LEAD = "LEAD", "Lead"
    MEMBER = "MEMBER", "Member"


class Team(BaseModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(blank=True, default="")
    identifier = models.CharField(max_length=10, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "workspace_teams"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.identifier})"


class TeamMembership(BaseModel):
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_team_memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=TeamRole.choices,
        default=TeamRole.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "workspace_team_memberships"
        ordering = ["-joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "user"],
                name="unique_workspace_team_user",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.team.name} ({self.role})"
```

**Step 4: Write `backend/workspace/models/project_team.py`**

```python
from django.db import models

from common.models import BaseModel


class ProjectTeam(BaseModel):
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="project_teams",
    )
    team = models.ForeignKey(
        "workspace.Team",
        on_delete=models.CASCADE,
        related_name="team_projects",
    )

    class Meta:
        db_table = "workspace_project_teams"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "team"],
                name="unique_project_team",
            ),
        ]

    def __str__(self):
        return f"{self.project.name} - {self.team.name}"
```

**Step 5: Write `backend/workspace/models/__init__.py`**

```python
from workspace.models.label import Label
from workspace.models.team import Team, TeamMembership, TeamRole
from workspace.models.project_team import ProjectTeam

__all__ = [
    "Label",
    "Team",
    "TeamMembership",
    "TeamRole",
    "ProjectTeam",
]
```

**Step 6: Add `workspace` to INSTALLED_APPS in `backend/config/settings/base.py`**

Add `"workspace"` after `"projects"` in the INSTALLED_APPS list.

**Step 7: Generate and run migrations**

```bash
docker compose exec backend python manage.py makemigrations workspace
docker compose exec backend python manage.py migrate
```

**Step 8: Commit**

```bash
git add backend/workspace/ backend/config/settings/base.py
git commit -m "feat: create workspace app with global Label, Team, TeamMembership, ProjectTeam models"
```

---

### Task 2: Write data migration to copy existing data into workspace tables

**Files:**
- Create: `backend/workspace/migrations/0002_migrate_data.py`

**Step 1: Write the data migration**

```python
from django.db import migrations


def migrate_data_forward(apps, schema_editor):
    # Old models
    OldLabel = apps.get_model("projects", "Label")
    OldTeam = apps.get_model("projects", "Team")
    OldTeamMembership = apps.get_model("projects", "TeamMembership")
    Project = apps.get_model("projects", "Project")
    Organization = apps.get_model("organizations", "Organization")

    # New models
    NewLabel = apps.get_model("workspace", "Label")
    NewTeam = apps.get_model("workspace", "Team")
    NewTeamMembership = apps.get_model("workspace", "TeamMembership")
    ProjectTeam = apps.get_model("workspace", "ProjectTeam")

    # --- Migrate Labels ---
    # Group by name to detect duplicates across orgs
    label_map = {}  # old_id -> new_id
    seen_names = {}  # name -> org_id (first seen)
    for old_label in OldLabel.objects.select_related("organization").order_by("created_at"):
        name = old_label.name
        if name in seen_names and seen_names[name] != old_label.organization_id:
            # Duplicate name from different org — append org name
            org_name = old_label.organization.name
            name = f"{old_label.name} ({org_name})"
        seen_names.setdefault(old_label.name, old_label.organization_id)

        new_label = NewLabel.objects.create(
            id=old_label.id,
            name=name,
            color=old_label.color,
            description=old_label.description,
            created_at=old_label.created_at,
            updated_at=old_label.updated_at,
        )
        label_map[old_label.id] = new_label.id

    # --- Migrate Teams ---
    team_map = {}  # old_id -> new_id
    seen_slugs = {}
    seen_identifiers = {}
    for old_team in OldTeam.objects.select_related("organization").order_by("created_at"):
        slug = old_team.slug
        identifier = old_team.identifier

        if slug in seen_slugs and seen_slugs[slug] != old_team.organization_id:
            org_slug = old_team.organization.slug
            slug = f"{old_team.slug}-{org_slug}"

        if identifier in seen_identifiers and seen_identifiers[identifier] != old_team.organization_id:
            # Truncate org slug to fit 10 char max
            org_slug = old_team.organization.slug[:3].upper()
            identifier = f"{old_team.identifier[:6]}{org_slug}"

        seen_slugs.setdefault(old_team.slug, old_team.organization_id)
        seen_identifiers.setdefault(old_team.identifier, old_team.organization_id)

        new_team = NewTeam.objects.create(
            id=old_team.id,
            name=old_team.name,
            slug=slug,
            description=old_team.description,
            identifier=identifier,
            is_active=old_team.is_active,
            created_at=old_team.created_at,
            updated_at=old_team.updated_at,
        )
        team_map[old_team.id] = new_team.id

    # --- Migrate TeamMemberships ---
    for old_tm in OldTeamMembership.objects.all():
        new_team_id = team_map.get(old_tm.team_id)
        if new_team_id:
            NewTeamMembership.objects.create(
                id=old_tm.id,
                team_id=new_team_id,
                user_id=old_tm.user_id,
                role=old_tm.role,
                joined_at=old_tm.joined_at,
                created_at=old_tm.created_at,
                updated_at=old_tm.updated_at,
            )

    # --- Create ProjectTeam records from existing Project.team FK ---
    for project in Project.objects.all():
        if project.team_id:
            new_team_id = team_map.get(project.team_id)
            if new_team_id:
                ProjectTeam.objects.create(
                    project_id=project.id,
                    team_id=new_team_id,
                )


def migrate_data_backward(apps, schema_editor):
    # Clear workspace tables (reverse is lossy)
    apps.get_model("workspace", "ProjectTeam").objects.all().delete()
    apps.get_model("workspace", "TeamMembership").objects.all().delete()
    apps.get_model("workspace", "Team").objects.all().delete()
    apps.get_model("workspace", "Label").objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("workspace", "0001_initial"),
        ("projects", "0001_initial"),
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(migrate_data_forward, migrate_data_backward),
    ]
```

**Step 2: Run the migration**

```bash
docker compose exec backend python manage.py migrate workspace
```

**Step 3: Commit**

```bash
git add backend/workspace/migrations/0002_migrate_data.py
git commit -m "feat: add data migration to copy labels/teams from projects to workspace"
```

---

### Task 3: Update Issue.labels M2M to point to workspace.Label

**Files:**
- Modify: `backend/projects/models/issue.py:20` (labels M2M)

**Step 1: Change the M2M reference in `backend/projects/models/issue.py`**

Change:
```python
labels = models.ManyToManyField(Label, blank=True, related_name="issues")
```
To:
```python
labels = models.ManyToManyField(
    "workspace.Label", blank=True, related_name="issues"
)
```

Also remove the import of `Label` from the local imports if present.

**Step 2: Update the Issue's label M2M table data**

Create a migration that copies M2M relationships from old labels to new workspace labels (since they share the same UUIDs from Task 2, Django may handle this with just the FK change — verify by generating the migration).

```bash
docker compose exec backend python manage.py makemigrations projects
docker compose exec backend python manage.py migrate
```

**Step 3: Commit**

```bash
git add backend/projects/models/issue.py backend/projects/migrations/
git commit -m "feat: point Issue.labels M2M to workspace.Label"
```

---

### Task 4: Remove FK `team` from Project, remove old Label/Team models from projects app

**Files:**
- Modify: `backend/projects/models/project.py:42-46` (remove team FK)
- Modify: `backend/projects/models/__init__.py` (remove Team, TeamMembership, TeamRole, Label exports)
- Delete: `backend/projects/models/label.py`
- Delete: `backend/projects/models/team.py`

**Step 1: Remove the `team` FK from Project model**

In `backend/projects/models/project.py`, remove:
```python
team = models.ForeignKey(
    "projects.Team",
    on_delete=models.CASCADE,
    related_name="projects",
)
```

**Step 2: Delete `backend/projects/models/label.py` and `backend/projects/models/team.py`**

**Step 3: Update `backend/projects/models/__init__.py`**

Remove imports of `Team`, `TeamMembership`, `TeamRole`, and `Label`. The remaining imports are from project, milestone, cycle, issue, etc.

**Step 4: Generate and run migration**

```bash
docker compose exec backend python manage.py makemigrations projects
docker compose exec backend python manage.py migrate
```

**Step 5: Commit**

```bash
git add backend/projects/models/ backend/projects/migrations/
git commit -m "feat: remove org-scoped Team, Label models and Project.team FK from projects app"
```

---

## Phase 2: Backend — Workspace Selectors, Services, Serializers, Views

### Task 5: Write workspace selectors

**Files:**
- Create: `backend/workspace/selectors/label_selector.py`
- Create: `backend/workspace/selectors/team_selector.py`
- Create: `backend/workspace/selectors/project_team_selector.py`
- Modify: `backend/workspace/selectors/__init__.py`

**Step 1: Write `backend/workspace/selectors/label_selector.py`**

```python
from workspace.models import Label


def list_labels(*, search=None):
    qs = Label.objects.all()
    if search:
        qs = qs.filter(name__icontains=search)
    return qs


def get_label_by_id(label_id):
    return Label.objects.filter(id=label_id).first()
```

**Step 2: Write `backend/workspace/selectors/team_selector.py`**

```python
from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from workspace.models import Team, TeamMembership


def list_teams(*, search=None):
    qs = Team.objects.filter(is_active=True)
    if search:
        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        qs = qs.annotate(rank=SearchRank(vector, query)).filter(rank__gt=0).order_by("-rank")
    return qs


def get_team_by_slug(team_slug):
    return Team.objects.filter(slug=team_slug, is_active=True).first()


def list_team_members(team):
    return TeamMembership.objects.filter(team=team).select_related("user")


def get_team_membership(team, user):
    return TeamMembership.objects.filter(
        team=team, user=user,
    ).select_related("user").first()
```

**Step 3: Write `backend/workspace/selectors/project_team_selector.py`**

```python
from workspace.models import ProjectTeam


def list_project_teams(project):
    return ProjectTeam.objects.filter(
        project=project,
    ).select_related("team")


def get_project_team(project, team):
    return ProjectTeam.objects.filter(
        project=project, team=team,
    ).first()
```

**Step 4: Write `backend/workspace/selectors/__init__.py`**

```python
from workspace.selectors.label_selector import (
    get_label_by_id,
    list_labels,
)
from workspace.selectors.team_selector import (
    get_team_by_slug,
    get_team_membership,
    list_team_members,
    list_teams,
)
from workspace.selectors.project_team_selector import (
    get_project_team,
    list_project_teams,
)

__all__ = [
    "get_label_by_id",
    "list_labels",
    "get_team_by_slug",
    "get_team_membership",
    "list_team_members",
    "list_teams",
    "get_project_team",
    "list_project_teams",
]
```

**Step 5: Commit**

```bash
git add backend/workspace/selectors/
git commit -m "feat: add workspace selectors for labels, teams, and project-teams"
```

---

### Task 6: Write workspace services

**Files:**
- Create: `backend/workspace/services/label_service.py`
- Create: `backend/workspace/services/team_service.py`
- Create: `backend/workspace/services/project_team_service.py`
- Modify: `backend/workspace/services/__init__.py`

**Step 1: Write `backend/workspace/services/label_service.py`**

```python
from common.exceptions import ConflictError
from workspace.models import Label


def create_label(name, color="#6b7280", description=""):
    if Label.objects.filter(name=name).exists():
        raise ConflictError("A label with this name already exists.")
    return Label.objects.create(name=name, color=color, description=description)


def update_label(label, **kwargs):
    allowed_fields = {"name", "color", "description"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(label, field, value)
    label.save()
    return label


def delete_label(label):
    label.delete()
```

**Step 2: Write `backend/workspace/services/team_service.py`**

```python
from django.db import transaction

from common.exceptions import ConflictError
from workspace.models import Team, TeamMembership, TeamRole


def create_team(name, slug, identifier, creator, **kwargs):
    if Team.objects.filter(slug=slug).exists():
        raise ConflictError("A team with this slug already exists.")
    if Team.objects.filter(identifier=identifier).exists():
        raise ConflictError("A team with this identifier already exists.")

    with transaction.atomic():
        team = Team.objects.create(
            name=name,
            slug=slug,
            identifier=identifier,
            **kwargs,
        )
        TeamMembership.objects.create(
            team=team,
            user=creator,
            role=TeamRole.LEAD,
        )

    return team


def update_team(team, **kwargs):
    allowed_fields = {"name", "description"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(team, field, value)
    team.save()
    return team


def delete_team(team):
    team.is_active = False
    team.save()


def add_team_member(team, user, role=TeamRole.MEMBER):
    existing = TeamMembership.objects.filter(team=team, user=user).first()
    if existing:
        raise ConflictError("User is already a member of this team.")
    return TeamMembership.objects.create(team=team, user=user, role=role)


def update_team_member_role(membership, new_role):
    if membership.role == TeamRole.LEAD and new_role != TeamRole.LEAD:
        lead_count = TeamMembership.objects.filter(
            team=membership.team, role=TeamRole.LEAD,
        ).count()
        if lead_count <= 1:
            raise ConflictError("Cannot remove the last team lead.")
    membership.role = new_role
    membership.save()
    return membership


def remove_team_member(membership):
    if membership.role == TeamRole.LEAD:
        lead_count = TeamMembership.objects.filter(
            team=membership.team, role=TeamRole.LEAD,
        ).count()
        if lead_count <= 1:
            raise ConflictError("Cannot remove the last team lead.")
    membership.delete()
```

**Step 3: Write `backend/workspace/services/project_team_service.py`**

```python
from common.exceptions import ConflictError
from workspace.models import ProjectTeam


def add_project_team(project, team):
    existing = ProjectTeam.objects.filter(project=project, team=team).first()
    if existing:
        raise ConflictError("Team is already associated with this project.")
    return ProjectTeam.objects.create(project=project, team=team)


def remove_project_team(project_team):
    project_team.delete()
```

**Step 4: Write `backend/workspace/services/__init__.py`**

```python
from workspace.services.label_service import (
    create_label,
    delete_label,
    update_label,
)
from workspace.services.team_service import (
    add_team_member,
    create_team,
    delete_team,
    remove_team_member,
    update_team,
    update_team_member_role,
)
from workspace.services.project_team_service import (
    add_project_team,
    remove_project_team,
)

__all__ = [
    "create_label",
    "delete_label",
    "update_label",
    "add_team_member",
    "create_team",
    "delete_team",
    "remove_team_member",
    "update_team",
    "update_team_member_role",
    "add_project_team",
    "remove_project_team",
]
```

**Step 5: Commit**

```bash
git add backend/workspace/services/
git commit -m "feat: add workspace services for labels, teams, and project-teams"
```

---

### Task 7: Write workspace serializers

**Files:**
- Create: `backend/workspace/serializers/input.py`
- Create: `backend/workspace/serializers/output.py`
- Modify: `backend/workspace/serializers/__init__.py`

**Step 1: Write `backend/workspace/serializers/input.py`**

```python
from rest_framework import serializers

from workspace.models import TeamRole


# --- Label ---

class CreateLabelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    color = serializers.CharField(max_length=7, default="#6b7280")
    description = serializers.CharField(required=False, default="")


class UpdateLabelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    color = serializers.CharField(max_length=7, required=False)
    description = serializers.CharField(required=False)


# --- Team ---

class CreateTeamSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=255)
    identifier = serializers.CharField(max_length=10)
    description = serializers.CharField(required=False, default="")


class UpdateTeamSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)


class AddTeamMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=TeamRole.choices,
        default=TeamRole.MEMBER,
    )


class UpdateTeamMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=TeamRole.choices)


# --- ProjectTeam ---

class AddProjectTeamSerializer(serializers.Serializer):
    team_id = serializers.UUIDField()
```

**Step 2: Write `backend/workspace/serializers/output.py`**

```python
from rest_framework import serializers

from accounts.serializers.output import UserDetailSerializer
from workspace.models import Label, Team, TeamMembership, ProjectTeam


class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = [
            "id",
            "name",
            "color",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TeamListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "slug",
            "identifier",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields


class TeamDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "identifier",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TeamMembershipSerializer(serializers.ModelSerializer):
    user = UserDetailSerializer(read_only=True)

    class Meta:
        model = TeamMembership
        fields = [
            "id",
            "user",
            "role",
            "joined_at",
        ]
        read_only_fields = fields


class ProjectTeamSerializer(serializers.ModelSerializer):
    team = TeamListSerializer(read_only=True)

    class Meta:
        model = ProjectTeam
        fields = [
            "id",
            "team",
            "created_at",
        ]
        read_only_fields = fields
```

**Step 3: Commit**

```bash
git add backend/workspace/serializers/
git commit -m "feat: add workspace serializers for labels, teams, and project-teams"
```

---

### Task 8: Write workspace permission class

**Files:**
- Create: `backend/workspace/permissions.py`

**Step 1: Write `backend/workspace/permissions.py`**

```python
from rest_framework.permissions import BasePermission

from accounts.models.membership import MembershipRole, OrganizationMembership

ADMIN_ROLES = {MembershipRole.OWNER, MembershipRole.ADMIN}


class IsWorkspaceAdmin(BasePermission):
    """User is authenticated and ADMIN+ in at least one organization."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user,
            role__in=ADMIN_ROLES,
            is_active=True,
            organization__is_active=True,
        ).exists()


class IsWorkspaceMember(BasePermission):
    """User is authenticated and a member of at least one organization."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user,
            is_active=True,
            organization__is_active=True,
        ).exists()
```

**Step 2: Commit**

```bash
git add backend/workspace/permissions.py
git commit -m "feat: add IsWorkspaceAdmin and IsWorkspaceMember permission classes"
```

---

### Task 9: Write workspace views and URL routing

**Files:**
- Create: `backend/workspace/views/label_views.py`
- Create: `backend/workspace/views/team_views.py`
- Create: `backend/workspace/views/project_team_views.py`
- Modify: `backend/workspace/views/__init__.py`
- Create: `backend/workspace/urls.py`
- Modify: `backend/config/urls.py` (add workspace URL include)

**Step 1: Write `backend/workspace/views/label_views.py`**

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from workspace.permissions import IsWorkspaceAdmin, IsWorkspaceMember
from workspace.selectors import get_label_by_id, list_labels
from workspace.serializers.input import CreateLabelSerializer, UpdateLabelSerializer
from workspace.serializers.output import LabelSerializer
from workspace.services import create_label, delete_label, update_label


class LabelListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceAdmin()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request):
        search = request.query_params.get("q")
        labels = list_labels(search=search)
        return self.paginate(labels, LabelSerializer, request)

    def post(self, request):
        serializer = CreateLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        label = create_label(**serializer.validated_data)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_201_CREATED)


class LabelDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsWorkspaceMember()]
        return [IsAuthenticated(), IsWorkspaceAdmin()]

    def _get_label(self, label_id):
        from rest_framework.exceptions import NotFound

        label = get_label_by_id(label_id)
        if label is None:
            raise NotFound("Label not found.")
        return label

    def get(self, request, label_id):
        label = self._get_label(label_id)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, label_id):
        label = self._get_label(label_id)
        serializer = UpdateLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        label = update_label(label, **serializer.validated_data)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, label_id):
        label = self._get_label(label_id)
        delete_label(label)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 2: Write `backend/workspace/views/team_views.py`**

```python
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.selectors import get_user_by_email
from common.mixins import PaginatedViewMixin
from workspace.permissions import IsWorkspaceAdmin, IsWorkspaceMember
from workspace.selectors import (
    get_team_by_slug,
    get_team_membership,
    list_team_members,
    list_teams,
)
from workspace.serializers.input import (
    AddTeamMemberSerializer,
    CreateTeamSerializer,
    UpdateTeamMemberRoleSerializer,
    UpdateTeamSerializer,
)
from workspace.serializers.output import (
    TeamDetailSerializer,
    TeamListSerializer,
    TeamMembershipSerializer,
)
from workspace.services import (
    add_team_member,
    create_team,
    delete_team,
    remove_team_member,
    update_team,
    update_team_member_role,
)


class TeamListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceAdmin()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request):
        search = request.query_params.get("q")
        teams = list_teams(search=search)
        return self.paginate(teams, TeamListSerializer, request)

    def post(self, request):
        serializer = CreateTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        team = create_team(creator=request.user, **serializer.validated_data)
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_201_CREATED)


class TeamDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsWorkspaceMember()]
        return [IsAuthenticated(), IsWorkspaceAdmin()]

    def _get_team(self, team_slug):
        team = get_team_by_slug(team_slug)
        if team is None:
            raise NotFound("Team not found.")
        return team

    def get(self, request, team_slug):
        team = self._get_team(team_slug)
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, team_slug):
        team = self._get_team(team_slug)
        serializer = UpdateTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        team = update_team(team, **serializer.validated_data)
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, team_slug):
        team = self._get_team(team_slug)
        delete_team(team)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceAdmin()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def _get_team(self, team_slug):
        team = get_team_by_slug(team_slug)
        if team is None:
            raise NotFound("Team not found.")
        return team

    def get(self, request, team_slug):
        team = self._get_team(team_slug)
        members = list_team_members(team)
        return self.paginate(members, TeamMembershipSerializer, request)

    def post(self, request, team_slug):
        team = self._get_team(team_slug)
        serializer = AddTeamMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_user_by_email(serializer.validated_data["email"])
        if user is None:
            raise NotFound("No user found with this email.")

        membership = add_team_member(
            team=team,
            user=user,
            role=serializer.validated_data["role"],
        )
        output = TeamMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_201_CREATED)


class TeamMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceAdmin]

    def _get_team_and_membership(self, team_slug, user_id):
        from accounts.models import User

        team = get_team_by_slug(team_slug)
        if team is None:
            raise NotFound("Team not found.")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound("User not found.")

        membership = get_team_membership(team, user)
        if membership is None:
            raise NotFound("Team membership not found.")
        return membership

    def put(self, request, team_slug, user_id):
        membership = self._get_team_and_membership(team_slug, user_id)
        serializer = UpdateTeamMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        membership = update_team_member_role(
            membership, new_role=serializer.validated_data["role"],
        )
        output = TeamMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, team_slug, user_id):
        membership = self._get_team_and_membership(team_slug, user_id)
        remove_team_member(membership)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 3: Write `backend/workspace/views/project_team_views.py`**

```python
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from projects.permissions import IsProjectAccessible
from workspace.selectors import get_project_team, get_team_by_slug, list_project_teams
from workspace.serializers.input import AddProjectTeamSerializer
from workspace.serializers.output import ProjectTeamSerializer
from workspace.services import add_project_team, remove_project_team


class ProjectTeamListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsProjectAccessible()]

    def get(self, request, org_slug, project_slug):
        project_teams = list_project_teams(request.project)
        return self.paginate(project_teams, ProjectTeamSerializer, request)

    def post(self, request, org_slug, project_slug):
        serializer = AddProjectTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from workspace.models import Team
        try:
            team = Team.objects.get(
                id=serializer.validated_data["team_id"], is_active=True,
            )
        except Team.DoesNotExist:
            raise NotFound("Team not found.")

        pt = add_project_team(project=request.project, team=team)
        output = ProjectTeamSerializer(pt).data
        return Response(output, status=status.HTTP_201_CREATED)


class ProjectTeamDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def delete(self, request, org_slug, project_slug, team_id):
        from workspace.models import Team
        try:
            team = Team.objects.get(id=team_id, is_active=True)
        except Team.DoesNotExist:
            raise NotFound("Team not found.")

        pt = get_project_team(request.project, team)
        if pt is None:
            raise NotFound("Team is not associated with this project.")

        remove_project_team(pt)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 4: Write `backend/workspace/views/__init__.py`**

```python
from workspace.views.label_views import LabelDetailView, LabelListCreateView
from workspace.views.team_views import (
    TeamDetailView,
    TeamListCreateView,
    TeamMemberDetailView,
    TeamMemberListCreateView,
)
from workspace.views.project_team_views import (
    ProjectTeamDetailView,
    ProjectTeamListCreateView,
)

__all__ = [
    "LabelDetailView",
    "LabelListCreateView",
    "TeamDetailView",
    "TeamListCreateView",
    "TeamMemberDetailView",
    "TeamMemberListCreateView",
    "ProjectTeamDetailView",
    "ProjectTeamListCreateView",
]
```

**Step 5: Write `backend/workspace/urls.py`**

```python
from django.urls import path

from workspace.views import (
    LabelDetailView,
    LabelListCreateView,
    TeamDetailView,
    TeamListCreateView,
    TeamMemberDetailView,
    TeamMemberListCreateView,
)

urlpatterns = [
    # Labels
    path("labels/", LabelListCreateView.as_view(), name="workspace-label-list"),
    path("labels/<uuid:label_id>/", LabelDetailView.as_view(), name="workspace-label-detail"),

    # Teams
    path("teams/", TeamListCreateView.as_view(), name="workspace-team-list"),
    path("teams/<slug:team_slug>/", TeamDetailView.as_view(), name="workspace-team-detail"),
    path("teams/<slug:team_slug>/members/", TeamMemberListCreateView.as_view(), name="workspace-team-member-list"),
    path("teams/<slug:team_slug>/members/<uuid:user_id>/", TeamMemberDetailView.as_view(), name="workspace-team-member-detail"),
]
```

**Step 6: Update `backend/config/urls.py` to include workspace URLs and project-team URLs**

Add to urlpatterns:
```python
path("api/v1/workspace/", include("workspace.urls")),
```

**Step 7: Add project-team endpoints to `backend/projects/urls.py`**

Add these URL patterns:
```python
path("projects/<slug:project_slug>/teams/", ProjectTeamListCreateView.as_view()),
path("projects/<slug:project_slug>/teams/<uuid:team_id>/", ProjectTeamDetailView.as_view()),
```

Import `ProjectTeamListCreateView` and `ProjectTeamDetailView` from `workspace.views`.

**Step 8: Commit**

```bash
git add backend/workspace/views/ backend/workspace/urls.py backend/config/urls.py backend/projects/urls.py
git commit -m "feat: add workspace API views and URL routing for labels, teams, and project-teams"
```

---

### Task 10: Remove old team/label views, selectors, services from projects app

**Files:**
- Modify: `backend/projects/urls.py` (remove old team/label URL patterns)
- Modify: `backend/projects/views/__init__.py` (remove team/label view imports)
- Delete: `backend/projects/views/team_views.py`
- Delete: `backend/projects/views/label_views.py`
- Modify: `backend/projects/selectors/__init__.py` (remove team/label selector imports)
- Delete: `backend/projects/selectors/team_selector.py`
- Delete: `backend/projects/selectors/label_selector.py`
- Modify: `backend/projects/services/__init__.py` (remove team/label service imports)
- Delete: `backend/projects/services/team_service.py`
- Delete: `backend/projects/services/label_service.py`
- Modify: `backend/projects/serializers/input.py` (remove team/label serializer classes)
- Modify: `backend/projects/serializers/output.py` (update imports to use workspace models)
- Modify: `backend/projects/permissions.py` (remove IsTeamAccessible)

**Step 1: Remove team/label URL patterns from `backend/projects/urls.py`**

Remove these patterns:
```python
path("teams/", ...),
path("teams/<slug:team_slug>/", ...),
path("teams/<slug:team_slug>/members/", ...),
path("teams/<slug:team_slug>/members/<uuid:user_id>/", ...),
path("labels/", ...),
path("labels/<uuid:label_id>/", ...),
```

**Step 2: Delete the old view, selector, and service files**

Delete:
- `backend/projects/views/team_views.py`
- `backend/projects/views/label_views.py`
- `backend/projects/selectors/team_selector.py`
- `backend/projects/selectors/label_selector.py`
- `backend/projects/services/team_service.py`
- `backend/projects/services/label_service.py`

**Step 3: Update `backend/projects/views/__init__.py`**

Remove imports: `TeamListCreateView`, `TeamDetailView`, `TeamMemberListCreateView`, `TeamMemberDetailView`, `LabelListCreateView`, `LabelDetailView`.

**Step 4: Update `backend/projects/selectors/__init__.py`**

Remove imports of `list_organization_teams`, `get_team_by_slug`, `list_team_members`, `get_team_membership`, `list_organization_labels`, `get_label_by_id`.

**Step 5: Update `backend/projects/services/__init__.py`**

Remove imports of `create_team`, `update_team`, `delete_team`, `add_team_member`, `update_team_member_role`, `remove_team_member`, `create_label`, `update_label`, `delete_label`.

**Step 6: Update `backend/projects/serializers/input.py`**

Remove: `CreateTeamSerializer`, `UpdateTeamSerializer`, `AddTeamMemberSerializer`, `UpdateTeamMemberRoleSerializer`, `CreateLabelSerializer`, `UpdateLabelSerializer`. Also remove `TeamRole` import.

**Step 7: Update `backend/projects/serializers/output.py`**

Change imports to use workspace models for Team/Label serializers. Since the output serializers for Team and Label are now in the workspace app, update `ProjectListSerializer` and `ProjectDetailSerializer`:

- Remove `TeamListSerializer`, `TeamDetailSerializer`, `TeamMembershipSerializer`, `LabelSerializer` from this file.
- Import `TeamListSerializer` and `LabelSerializer` from `workspace.serializers.output`.
- Remove the `team = TeamListSerializer(read_only=True)` field from `ProjectListSerializer` and `ProjectDetailSerializer` (Project no longer has a `team` FK).
- Remove `"team"` from the `fields` lists in `ProjectListSerializer` and `ProjectDetailSerializer`.

**Step 8: Update `backend/projects/permissions.py`**

Remove the `IsTeamAccessible` class (no longer needed — teams are accessed via workspace URLs).

**Step 9: Update `backend/projects/views/project_views.py`**

Remove the `get_team_by_slug` import (no longer used for project creation).

Update `ProjectListCreateView.post` to not require `team_slug`:
- Remove `team_slug = data.pop("team_slug")` and `team = get_team_by_slug(...)` lines.
- Remove `team=team` from `create_project(...)` call.

Update `CreateProjectSerializer` in `backend/projects/serializers/input.py`:
- Remove `team_slug` field.

Update `create_project` in `backend/projects/services/project_service.py`:
- Remove `team` parameter.
- Remove `team=team` from `Project.objects.create(...)`.

**Step 10: Commit**

```bash
git add backend/projects/
git commit -m "refactor: remove org-scoped team/label code from projects app"
```

---

### Task 11: Update test factories, fixtures, and existing tests

**Files:**
- Modify: `backend/tests/factories.py`
- Modify: `backend/conftest.py`
- Modify: `backend/tests/test_issues.py`
- Create: `backend/tests/test_workspace.py`

**Step 1: Update `backend/tests/factories.py`**

Replace `TeamFactory` and `LabelFactory` to use workspace models:

```python
# Replace old imports
from workspace.models import Label, Team, TeamMembership, ProjectTeam

# Update TeamFactory — remove organization field
class TeamFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Team

    name = factory.Sequence(lambda n: f"Team {n}")
    slug = factory.Sequence(lambda n: f"team-{n}")
    identifier = factory.Sequence(lambda n: f"T{n}")
    description = "Test team"


class TeamMembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = TeamMembership

    team = factory.SubFactory(TeamFactory)
    user = factory.SubFactory(UserFactory)
    role = "MEMBER"


# Update LabelFactory — remove organization field
class LabelFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Label

    name = factory.Sequence(lambda n: f"Label {n}")
    color = "#6b7280"


# Add ProjectTeamFactory
class ProjectTeamFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProjectTeam

    project = factory.SubFactory(ProjectFactory)
    team = factory.SubFactory(TeamFactory)


# Update ProjectFactory — remove team field
class ProjectFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Project

    organization = factory.SubFactory(OrganizationFactory)
    name = factory.Sequence(lambda n: f"Project {n}")
    slug = factory.Sequence(lambda n: f"project-{n}")
    description = "Test project"
    lead = factory.SubFactory(UserFactory)
```

**Step 2: Update `backend/conftest.py`**

```python
# Update team fixture — no organization
@pytest.fixture()
def team(user):
    t = TeamFactory()
    TeamMembershipFactory(team=t, user=user, role="LEAD")
    return t


# Update label fixture — no organization
@pytest.fixture()
def label():
    return LabelFactory()


# Update project fixture — no team FK
@pytest.fixture()
def project(organization, user):
    p = ProjectFactory(organization=organization, lead=user)
    ProjectSettingsFactory(project=p)
    ProjectMembershipFactory(project=p, user=user, role="LEAD")
    return p
```

**Step 3: Update `backend/tests/test_issues.py`**

Change the label creation in `test_create_issue_with_labels`:
```python
# Old: label = LabelFactory(organization=organization)
# New:
label = LabelFactory()
```

**Step 4: Write `backend/tests/test_workspace.py`**

```python
import pytest
from rest_framework import status

from tests.factories import LabelFactory, TeamFactory, TeamMembershipFactory

pytestmark = pytest.mark.django_db

LABELS_URL = "/api/v1/workspace/labels/"
TEAMS_URL = "/api/v1/workspace/teams/"


def label_url(label_id):
    return f"/api/v1/workspace/labels/{label_id}/"


def team_url(team_slug):
    return f"/api/v1/workspace/teams/{team_slug}/"


def team_members_url(team_slug):
    return f"/api/v1/workspace/teams/{team_slug}/members/"


class TestWorkspaceLabels:
    def test_list_labels(self, authenticated_client, organization):
        LabelFactory()
        response = authenticated_client.get(LABELS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_create_label(self, authenticated_client, organization):
        data = {"name": "Bug", "color": "#ef4444"}
        response = authenticated_client.post(LABELS_URL, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Bug"

    def test_update_label(self, authenticated_client, organization):
        label = LabelFactory()
        data = {"name": "Updated"}
        response = authenticated_client.put(label_url(label.id), data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated"

    def test_delete_label(self, authenticated_client, organization):
        label = LabelFactory()
        response = authenticated_client.delete(label_url(label.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_unauthenticated(self, api_client):
        response = api_client.get(LABELS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestWorkspaceTeams:
    def test_list_teams(self, authenticated_client, organization):
        TeamFactory()
        response = authenticated_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_create_team(self, authenticated_client, organization):
        data = {
            "name": "Engineering",
            "slug": "engineering",
            "identifier": "ENG",
        }
        response = authenticated_client.post(TEAMS_URL, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Engineering"

    def test_get_team(self, authenticated_client, organization):
        team = TeamFactory()
        response = authenticated_client.get(team_url(team.slug))
        assert response.status_code == status.HTTP_200_OK

    def test_update_team(self, authenticated_client, organization):
        team = TeamFactory()
        data = {"name": "Updated Team"}
        response = authenticated_client.put(team_url(team.slug), data, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Team"

    def test_delete_team(self, authenticated_client, organization):
        team = TeamFactory()
        response = authenticated_client.delete(team_url(team.slug))
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_list_team_members(self, authenticated_client, organization):
        team = TeamFactory()
        TeamMembershipFactory(team=team)
        response = authenticated_client.get(team_members_url(team.slug))
        assert response.status_code == status.HTTP_200_OK

    def test_unauthenticated(self, api_client):
        response = api_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
```

**Step 5: Run tests**

```bash
docker compose exec backend pytest -v
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add backend/tests/ backend/conftest.py
git commit -m "test: update factories/fixtures for workspace models, add workspace API tests"
```

---

### Task 12: Update seed command

**Files:**
- Modify: `backend/common/management/commands/seed_data.py`

**Step 1: Update imports and service calls**

Replace:
```python
from projects.services import (
    add_team_member,
    create_cycle,
    create_issue,
    create_label,
    create_milestone,
    create_project,
    create_team,
    create_comment,
)
```

With:
```python
from projects.services import (
    create_cycle,
    create_issue,
    create_milestone,
    create_project,
    create_comment,
)
from workspace.services import (
    add_team_member,
    create_label,
    create_team,
)
```

**Step 2: Update team creation calls — remove `organization` parameter**

```python
eng_team = create_team(
    name="Engineering",
    slug="engineering",
    identifier="ENG",
    creator=admin,
    description="Engineering team",
)
des_team = create_team(
    name="Design",
    slug="design",
    identifier="DES",
    creator=admin,
    description="Design team",
)
```

**Step 3: Update label creation calls — remove first positional `org` arg**

```python
labels[name] = create_label(name, color=color, description=description)
```

**Step 4: Update project creation calls — remove `team` parameter**

```python
p1 = create_project(
    organization=org,
    name="Backend API",
    slug="backend-api",
    creator=admin,
    # ... remaining kwargs same, NO team=eng_team
)
```

After creating projects, add ProjectTeam associations:
```python
from workspace.services import add_project_team
add_project_team(p1, eng_team)
add_project_team(p2, eng_team)
add_project_team(p3, des_team)
```

**Step 5: Update flush section**

Replace:
```python
from projects.models import Issue, Cycle, Milestone, Project, Team, Label
```
With:
```python
from projects.models import Issue, Cycle, Milestone, Project
from workspace.models import Team, Label, ProjectTeam
```

Add `ProjectTeam.objects.all().delete()` before Team/Label deletes.

**Step 6: Commit**

```bash
git add backend/common/management/commands/seed_data.py
git commit -m "feat: update seed command for workspace global resources"
```

---

## Phase 3: Frontend — API Modules, Types, and Routes

### Task 13: Update frontend types

**Files:**
- Modify: `frontend/types/projects.ts`

**Step 1: Update `ProjectList` and `ProjectDetail` interfaces**

Remove the `team: Team` field. Add `teams?: Team[]` as optional (will be fetched separately).

```typescript
export interface ProjectList {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  lead: User | null;
  start_date: string | null;
  target_date: string | null;
  sort_order: number;
  icon: string;
  color: string;
  created_at: string;
}
```

**Step 2: Update `CreateProjectPayload`**

Remove `team_slug` field:
```typescript
export interface CreateProjectPayload {
  name: string;
  slug: string;
  description?: string;
  short_summary?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  start_date?: string | null;
  target_date?: string | null;
}
```

**Step 3: Add `ProjectTeam` interface**

```typescript
export interface ProjectTeam {
  id: string;
  team: Team;
  created_at: string;
}

export interface AddProjectTeamPayload {
  team_id: string;
}
```

**Step 4: Commit**

```bash
git add frontend/types/projects.ts
git commit -m "feat: update frontend types for workspace global resources"
```

---

### Task 14: Create workspace API module, update project-teams API

**Files:**
- Create: `frontend/lib/api/workspace.ts`
- Create: `frontend/lib/api/project-teams.ts`
- Delete: `frontend/lib/api/teams.ts`
- Delete: `frontend/lib/api/labels.ts`
- Modify: `frontend/lib/api/index.ts` (update re-exports)

**Step 1: Write `frontend/lib/api/workspace.ts`**

```typescript
import api from "@/lib/api";
import type {
  Label,
  CreateLabelPayload,
  UpdateLabelPayload,
  Team,
  TeamDetail,
  TeamMember,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddTeamMemberPayload,
  UpdateTeamMemberRolePayload,
  PaginatedResponse,
} from "@/types";

// --- Labels ---

export async function listLabels(cursor?: string): Promise<PaginatedResponse<Label>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Label>>("/workspace/labels/", { params });
  return data;
}

export async function createLabel(payload: CreateLabelPayload): Promise<Label> {
  const { data } = await api.post<Label>("/workspace/labels/", payload);
  return data;
}

export async function updateLabel(labelId: string, payload: UpdateLabelPayload): Promise<Label> {
  const { data } = await api.put<Label>(`/workspace/labels/${labelId}/`, payload);
  return data;
}

export async function deleteLabel(labelId: string): Promise<void> {
  await api.delete(`/workspace/labels/${labelId}/`);
}

// --- Teams ---

export async function listTeams(cursor?: string): Promise<PaginatedResponse<Team>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Team>>("/workspace/teams/", { params });
  return data;
}

export async function createTeam(payload: CreateTeamPayload): Promise<TeamDetail> {
  const { data } = await api.post<TeamDetail>("/workspace/teams/", payload);
  return data;
}

export async function getTeam(teamSlug: string): Promise<TeamDetail> {
  const { data } = await api.get<TeamDetail>(`/workspace/teams/${teamSlug}/`);
  return data;
}

export async function updateTeam(teamSlug: string, payload: UpdateTeamPayload): Promise<TeamDetail> {
  const { data } = await api.put<TeamDetail>(`/workspace/teams/${teamSlug}/`, payload);
  return data;
}

export async function deleteTeam(teamSlug: string): Promise<void> {
  await api.delete(`/workspace/teams/${teamSlug}/`);
}

export async function listTeamMembers(teamSlug: string, cursor?: string): Promise<PaginatedResponse<TeamMember>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<TeamMember>>(`/workspace/teams/${teamSlug}/members/`, { params });
  return data;
}

export async function addTeamMember(teamSlug: string, payload: AddTeamMemberPayload): Promise<TeamMember> {
  const { data } = await api.post<TeamMember>(`/workspace/teams/${teamSlug}/members/`, payload);
  return data;
}

export async function updateTeamMemberRole(teamSlug: string, userId: string, payload: UpdateTeamMemberRolePayload): Promise<TeamMember> {
  const { data } = await api.put<TeamMember>(`/workspace/teams/${teamSlug}/members/${userId}/`, payload);
  return data;
}

export async function removeTeamMember(teamSlug: string, userId: string): Promise<void> {
  await api.delete(`/workspace/teams/${teamSlug}/members/${userId}/`);
}
```

**Step 2: Write `frontend/lib/api/project-teams.ts`**

```typescript
import api from "@/lib/api";
import type { ProjectTeam, AddProjectTeamPayload, PaginatedResponse } from "@/types";

export async function listProjectTeams(
  orgSlug: string,
  projectSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectTeam>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectTeam>>(
    `/organizations/${orgSlug}/projects/${projectSlug}/teams/`,
    { params }
  );
  return data;
}

export async function addProjectTeam(
  orgSlug: string,
  projectSlug: string,
  payload: AddProjectTeamPayload
): Promise<ProjectTeam> {
  const { data } = await api.post<ProjectTeam>(
    `/organizations/${orgSlug}/projects/${projectSlug}/teams/`,
    payload
  );
  return data;
}

export async function removeProjectTeam(
  orgSlug: string,
  projectSlug: string,
  teamId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgSlug}/projects/${projectSlug}/teams/${teamId}/`
  );
}
```

**Step 3: Delete `frontend/lib/api/teams.ts` and `frontend/lib/api/labels.ts`**

**Step 4: Update `frontend/lib/api/index.ts`**

Remove re-exports from `./teams` and `./labels`. Add re-exports from `./workspace` and `./project-teams`.

**Step 5: Commit**

```bash
git add frontend/lib/api/
git commit -m "feat: add workspace and project-teams API modules, remove old teams/labels modules"
```

---

### Task 15: Move teams and labels pages to workspace routes

**Files:**
- Create: `frontend/app/(dashboard)/workspace/layout.tsx`
- Create: `frontend/app/(dashboard)/workspace/teams/page.tsx`
- Create: `frontend/app/(dashboard)/workspace/teams/[teamSlug]/page.tsx`
- Create: `frontend/app/(dashboard)/workspace/labels/page.tsx`
- Delete: `frontend/app/(dashboard)/[orgSlug]/teams/` (entire directory)
- Delete: `frontend/app/(dashboard)/[orgSlug]/labels/` (entire directory)

**Step 1: Create workspace layout**

Write `frontend/app/(dashboard)/workspace/layout.tsx`:

```tsx
"use client";

import { Sidebar } from "@/components/sidebar";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden p-6">{children}</main>
    </div>
  );
}
```

Note: This layout does NOT wrap children in `OrgProvider` since workspace routes don't need an org context.

**Step 2: Create workspace teams page**

Write `frontend/app/(dashboard)/workspace/teams/page.tsx`. Copy from the existing `[orgSlug]/teams/page.tsx` and modify:

- Remove `useParams()` and `orgSlug`
- Remove `useOrg()` and `currentMembership`
- Replace `listTeams(orgSlug)` → `listTeams()` (from workspace API)
- Replace `deleteTeam(orgSlug, ...)` → `deleteTeam(...)` (from workspace API)
- Replace `router.push(\`/${orgSlug}/teams/${team.slug}\`)` → `router.push(\`/workspace/teams/${team.slug}\`)`
- Replace `<CreateTeamModal orgSlug={orgSlug} ...>` → `<CreateTeamModal ...>` (update modal props)
- For `canManage`, since workspace admin = admin in any org, you can either always show the buttons (the API enforces permissions) or add a `useWorkspaceAdmin` check.

For simplicity in this task, always show manage buttons and let the API enforce permissions (API returns 403 if not admin). Refine later if needed.

**Step 3: Create workspace team detail page**

Write `frontend/app/(dashboard)/workspace/teams/[teamSlug]/page.tsx`. Copy from existing `[orgSlug]/teams/[teamSlug]/page.tsx` and modify:

- Remove `orgSlug` from all API calls
- Use workspace API module instead of teams API module
- Update all navigation links to use `/workspace/teams/` prefix

**Step 4: Create workspace labels page**

Write `frontend/app/(dashboard)/workspace/labels/page.tsx`. Copy from existing `[orgSlug]/labels/page.tsx` and modify:

- Remove `orgSlug` from all API calls
- Use workspace API module instead of labels API module
- Remove `useOrg()` usage

**Step 5: Delete old directories**

Delete `frontend/app/(dashboard)/[orgSlug]/teams/` and `frontend/app/(dashboard)/[orgSlug]/labels/` directories.

**Step 6: Commit**

```bash
git add frontend/app/
git commit -m "feat: move teams and labels pages to /workspace/ routes"
```

---

### Task 16: Update sidebar navigation

**Files:**
- Modify: `frontend/components/sidebar.tsx`

**Step 1: Split nav items into workspace and org sections**

Replace the single `NAV_ITEMS` array with two:

```typescript
const WORKSPACE_ITEMS = [
  { label: "Teams", path: "/workspace/teams" },
  { label: "Labels", path: "/workspace/labels" },
];

const ORG_ITEMS = [
  { label: "Dashboard", path: "" },
  { label: "Projects", path: "/projects" },
  { label: "Members", path: "/members" },
  { label: "Agents", path: "/agents" },
  { label: "Toony Agents", path: "/toony-agents" },
  { label: "Imports", path: "/imports" },
  { label: "Credentials", path: "/credentials" },
  { label: "Settings", path: "/settings" },
];
```

**Step 2: Render workspace section above the org switcher**

Add a "Workspace" section above `<OrgSwitcher />`:

```tsx
{/* Workspace section */}
<div className="p-4 pb-2">
  <p className="mb-1 text-xs font-semibold uppercase text-slate-600">Workspace</p>
  <nav className="space-y-0.5">
    {WORKSPACE_ITEMS.map((item) => {
      const isActive = pathname.startsWith(item.path);
      return (
        <Link
          key={item.path}
          href={item.path}
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? "bg-slate-900 text-white"
              : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
          }`}
        >
          {item.label}
        </Link>
      );
    })}
  </nav>
</div>

{/* Org Switcher */}
<div className="border-b border-slate-800/60 p-4">
  <OrgSwitcher />
</div>
```

Then render org items below with the `basePath` prefix as before.

**Step 3: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat: split sidebar navigation into workspace and org sections"
```

---

### Task 17: Update CreateProjectModal — remove team requirement

**Files:**
- Modify: `frontend/components/create-project-modal.tsx`

**Step 1: Remove team selection from the modal**

- Remove the `listTeams` import and team fetch logic
- Remove the `teams` state and `teamSlug` state
- Remove the `<Select>` for team selection
- Remove `team_slug: teamSlug` from the `createProject` payload
- Remove the `teams.length === 0` disabled condition on submit button

**Step 2: Commit**

```bash
git add frontend/components/create-project-modal.tsx
git commit -m "feat: remove team requirement from CreateProjectModal"
```

---

### Task 18: Update projects page — remove team column from table

**Files:**
- Modify: `frontend/app/(dashboard)/[orgSlug]/projects/page.tsx`

**Step 1: Remove the Team column**

Remove the `<th>` and `<td>` for "Team" in the projects table (the `project.team.identifier` references).

**Step 2: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/projects/page.tsx
git commit -m "feat: remove team column from projects list"
```

---

### Task 19: Update project detail page — replace team FK with teams section

**Files:**
- Modify: `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx`

**Step 1: Remove team FK references from the overview tab**

This page currently displays `project.team.identifier` in the overview. Remove or replace those references.

**Step 2: Add a "Teams" section in the overview tab**

Add a section that:
- Fetches project teams via `listProjectTeams(orgSlug, projectSlug)`
- Displays associated teams as badges/chips
- Shows "Add team" button that opens a modal to select from `listTeams()` (workspace API)
- Shows "Remove" action on each team chip

This is the largest frontend change. The project detail page is very large, so be careful to only modify the relevant sections.

**Step 3: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/projects/\[projectSlug\]/page.tsx
git commit -m "feat: add project teams M2M management to project detail page"
```

---

### Task 20: Update CreateTeamModal to use workspace API

**Files:**
- Modify: `frontend/components/create-team-modal.tsx`

**Step 1: Update the modal**

- Replace import from `@/lib/api/teams` with `@/lib/api/workspace`
- Remove `orgSlug` prop and from all API calls
- Update `createTeam(orgSlug, payload)` → `createTeam(payload)`

**Step 2: Commit**

```bash
git add frontend/components/create-team-modal.tsx
git commit -m "feat: update CreateTeamModal to use workspace API"
```

---

## Phase 4: Verification

### Task 21: Run backend tests and lint

**Step 1: Run backend tests**

```bash
docker compose exec backend pytest -v
```

Expected: All tests pass.

**Step 2: Run backend lint**

```bash
docker compose exec backend flake8 --max-line-length=120 --exclude=migrations,__pycache__
```

Expected: No lint errors.

**Step 3: Fix any failures, then commit fixes**

---

### Task 22: Run frontend lint and build

**Step 1: Run frontend lint**

```bash
docker compose exec frontend ./node_modules/.bin/next lint
```

**Step 2: Run frontend build**

```bash
docker compose exec frontend ./node_modules/.bin/next build
```

Expected: Build succeeds with no errors.

**Step 3: Fix any failures, then commit fixes**

---

### Task 23: Run seed and manual smoke test

**Step 1: Reset and seed**

```bash
make seed-flush
```

Expected: Seed completes with "Seed data created successfully!"

**Step 2: Verify workspace API endpoints manually**

```bash
# After logging in and getting a token:
docker compose exec backend python manage.py shell -c "
from workspace.models import Label, Team, ProjectTeam
print(f'Labels: {Label.objects.count()}')
print(f'Teams: {Team.objects.count()}')
print(f'ProjectTeams: {ProjectTeam.objects.count()}')
"
```

Expected: Labels: 5, Teams: 2, ProjectTeams: 3

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
