# Remove Organization Scope — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove organization as the primary navigation scope. Users see all resources across all their organizations. Backend drops `/v1/`, uses UUIDs instead of slugs. Frontend uses flat routes.

**Architecture:** Backend URL restructuring (slug→UUID, drop org_slug from global resources, drop v1 prefix) + permission refactoring (resolve org from project/resource instead of URL) + frontend restructuring (flat routes, no OrgProvider, new org detail page with tabs, project cards).

**Tech Stack:** Django 5 / DRF, Next.js 15 / React 19, Tailwind CSS v4, Axios

**Design doc:** `docs/plans/2026-03-04-remove-org-scope-design.md`

---

## Task 1: Backend — Update `config/urls.py` (drop `/v1/`, restructure mounts)

**Files:**
- Modify: `backend/config/urls.py`

**Step 1: Update root URL configuration**

Replace the entire `urlpatterns` list:

```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", include("common.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/organizations/", include("organizations.urls")),
    path("api/workspace/", include("workspace.urls")),
    path("api/projects/", include("projects.urls")),
    path("api/", include("agents.urls")),
    path("api/toony-agents/", include("toony_agents.urls")),
    path("api/", include("importers.urls")),
    path("api/search/", include("organizations.search_urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
```

Key changes:
- `api/v1/` → `api/` everywhere
- `projects.urls` no longer mounted under `organizations/<org_slug>/` — now at `api/projects/`
- `toony_agents.urls` no longer mounted under `organizations/<org_slug>/` — now at `api/toony-agents/`
- `importers.urls` mounted at `api/` (its internal urls include `organizations/<uuid:org_id>/imports/...`)
- Search gets its own url include from `organizations.search_urls`

**Step 2: Run tests to verify they fail (expected — URLs changed)**

Run: `docker compose exec backend pytest tests/ -v --tb=short 2>&1 | head -50`
Expected: All tests FAIL with 404s (URLs changed)

**Step 3: Commit**

```bash
git add backend/config/urls.py
git commit -m "refactor(backend): drop /v1/ prefix and restructure URL mounts"
```

---

## Task 2: Backend — Update `organizations/urls.py` (slug → UUID)

**Files:**
- Modify: `backend/organizations/urls.py`
- Create: `backend/organizations/search_urls.py`

**Step 1: Update organizations URL patterns to use UUID**

```python
# organizations/urls.py
from django.urls import path

from organizations.views import (
    CredentialDetailView,
    CredentialListCreateView,
    IntegrationDetailView,
    IntegrationListCreateView,
    MemberDetailView,
    MemberListCreateView,
    OrganizationDetailView,
    OrganizationListCreateView,
    OrganizationSettingsView,
)

app_name = "organizations"

urlpatterns = [
    path("", OrganizationListCreateView.as_view(), name="list-create"),
    path("<uuid:org_id>/", OrganizationDetailView.as_view(), name="detail"),
    path("<uuid:org_id>/members/", MemberListCreateView.as_view(), name="members-list-create"),
    path("<uuid:org_id>/members/<uuid:user_id>/", MemberDetailView.as_view(), name="member-detail"),
    path("<uuid:org_id>/settings/", OrganizationSettingsView.as_view(), name="settings"),
    path("<uuid:org_id>/credentials/", CredentialListCreateView.as_view(), name="credentials-list-create"),
    path("<uuid:org_id>/credentials/<uuid:credential_id>/", CredentialDetailView.as_view(), name="credential-detail"),
    path("<uuid:org_id>/integrations/", IntegrationListCreateView.as_view(), name="integrations-list-create"),
    path("<uuid:org_id>/integrations/<uuid:integration_id>/", IntegrationDetailView.as_view(), name="integration-detail"),
]
```

**Step 2: Create search_urls.py**

```python
# organizations/search_urls.py
from django.urls import path
from organizations.views import GlobalSearchView

urlpatterns = [
    path("", GlobalSearchView.as_view(), name="global-search"),
]
```

**Step 3: Commit**

```bash
git add backend/organizations/urls.py backend/organizations/search_urls.py
git commit -m "refactor(backend): organizations URLs use UUID, extract search URL"
```

---

## Task 3: Backend — Update `organizations/permissions.py` (resolve by UUID)

**Files:**
- Modify: `backend/organizations/permissions.py`

**Step 1: Refactor `get_membership` to look up by org ID instead of slug**

```python
from rest_framework.permissions import BasePermission

from accounts.models import MembershipRole, OrganizationMembership


def get_membership(user, org_id):
    """Look up active membership by org UUID."""
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id=org_id,
        is_active=True,
        organization__is_active=True,
    ).select_related("organization").first()


ADMIN_ROLES = {MembershipRole.OWNER, MembershipRole.ADMIN}
MANAGER_ROLES = ADMIN_ROLES | {MembershipRole.MANAGER}
ALL_ROLES = MANAGER_ROLES | {MembershipRole.MEMBER, MembershipRole.VIEWER}
WRITE_ROLES = MANAGER_ROLES | {MembershipRole.MEMBER}


class IsOrganizationMember(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True


class IsOrganizationAdmin(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None or membership.role not in ADMIN_ROLES:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True


class IsOrganizationManager(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None or membership.role not in MANAGER_ROLES:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True


class IsOrganizationOwner(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None or membership.role != MembershipRole.OWNER:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True
```

**Step 2: Commit**

```bash
git add backend/organizations/permissions.py
git commit -m "refactor(backend): org permissions resolve by UUID instead of slug"
```

---

## Task 4: Backend — Update organization views (slug → UUID kwargs)

**Files:**
- Modify: `backend/organizations/views/` — all view files that reference `org_slug` in method signatures

**Step 1: Update all organization views**

In every view method signature, change `org_slug` → `org_id`. The views already use `request.organization` (resolved by permission class), so the change is just in the method signature kwargs.

For example in `OrganizationDetailView`:
- `def get(self, request, org_id):` (was `org_slug`)
- `def put(self, request, org_id):` (was `org_slug`)
- `def delete(self, request, org_id):` (was `org_slug`)

Same pattern for `MemberListCreateView`, `MemberDetailView`, `OrganizationSettingsView`, `CredentialListCreateView`, `CredentialDetailView`, `IntegrationListCreateView`, `IntegrationDetailView`, `GlobalSearchView`.

**Step 2: Commit**

```bash
git add backend/organizations/views/
git commit -m "refactor(backend): org views accept org_id UUID kwarg"
```

---

## Task 5: Backend — Update `projects/urls.py` (no org_slug, project by UUID)

**Files:**
- Modify: `backend/projects/urls.py`

**Step 1: Restructure project URLs**

Now mounted at `api/projects/` (no org prefix). Use `<uuid:project_id>` instead of `<slug:project_slug>`. Issues use `<uuid:issue_id>` instead of `<str:identifier>`.

```python
from django.urls import path

from projects.views import (
    CycleDetailView,
    CycleListCreateView,
    IssueActivityListView,
    IssueCommentDetailView,
    IssueCommentListCreateView,
    IssueDetailView,
    IssueListCreateView,
    MilestoneDetailView,
    MilestoneListCreateView,
    ProjectDetailView,
    ProjectListCreateView,
    ProjectMemberDetailView,
    ProjectMemberListCreateView,
    ProjectSettingsView,
    ResourceDetailView,
    ResourceListCreateView,
)
from workspace.views import ProjectTeamListCreateView, ProjectTeamDetailView

app_name = "projects"

urlpatterns = [
    # Projects
    path("", ProjectListCreateView.as_view(), name="project-list-create"),
    path("<uuid:project_id>/", ProjectDetailView.as_view(), name="project-detail"),
    path("<uuid:project_id>/members/", ProjectMemberListCreateView.as_view(), name="project-member-list-create"),
    path("<uuid:project_id>/members/<uuid:user_id>/", ProjectMemberDetailView.as_view(), name="project-member-detail"),
    path("<uuid:project_id>/settings/", ProjectSettingsView.as_view(), name="project-settings"),
    # Project Teams
    path("<uuid:project_id>/teams/", ProjectTeamListCreateView.as_view(), name="project-team-list-create"),
    path("<uuid:project_id>/teams/<uuid:team_id>/", ProjectTeamDetailView.as_view(), name="project-team-detail"),
    # Resources
    path("<uuid:project_id>/resources/", ResourceListCreateView.as_view(), name="resource-list-create"),
    path("<uuid:project_id>/resources/<uuid:resource_id>/", ResourceDetailView.as_view(), name="resource-detail"),
    # Milestones
    path("<uuid:project_id>/milestones/", MilestoneListCreateView.as_view(), name="milestone-list-create"),
    path("<uuid:project_id>/milestones/<uuid:milestone_id>/", MilestoneDetailView.as_view(), name="milestone-detail"),
    # Cycles
    path("<uuid:project_id>/cycles/", CycleListCreateView.as_view(), name="cycle-list-create"),
    path("<uuid:project_id>/cycles/<uuid:cycle_id>/", CycleDetailView.as_view(), name="cycle-detail"),
    # Issues
    path("<uuid:project_id>/issues/", IssueListCreateView.as_view(), name="issue-list-create"),
    path("<uuid:project_id>/issues/<uuid:issue_id>/", IssueDetailView.as_view(), name="issue-detail"),
    path("<uuid:project_id>/issues/<uuid:issue_id>/comments/", IssueCommentListCreateView.as_view(), name="issue-comment-list-create"),
    path("<uuid:project_id>/issues/<uuid:issue_id>/comments/<uuid:comment_id>/", IssueCommentDetailView.as_view(), name="issue-comment-detail"),
    path("<uuid:project_id>/issues/<uuid:issue_id>/activities/", IssueActivityListView.as_view(), name="issue-activity-list"),
]
```

**Step 2: Commit**

```bash
git add backend/projects/urls.py
git commit -m "refactor(backend): project URLs use UUID, no org prefix"
```

---

## Task 6: Backend — Update `projects/permissions.py` (resolve project by UUID)

**Files:**
- Modify: `backend/projects/permissions.py`
- Modify: `backend/projects/selectors/project_selector.py`

**Step 1: Add `get_project_by_id` selector**

Add to `project_selector.py`:

```python
def get_project_by_id(project_id):
    return Project.objects.filter(
        id=project_id,
    ).select_related("lead", "organization").first()
```

**Step 2: Refactor `IsProjectAccessible`**

```python
from rest_framework.permissions import BasePermission

from organizations.permissions import get_membership
from projects.selectors import get_project_by_id


class IsProjectAccessible(BasePermission):
    """Resolve project by UUID, then verify org membership."""

    def has_permission(self, request, view):
        project_id = view.kwargs.get("project_id")
        if not project_id:
            return False

        project = get_project_by_id(project_id)
        if project is None:
            return False

        membership = get_membership(request.user, project.organization_id)
        if membership is None:
            return False

        request.membership = membership
        request.organization = membership.organization
        request.project = project
        return True
```

**Step 3: Add `list_user_projects` selector**

Add to `project_selector.py`:

```python
def list_user_projects(user, *, search=None):
    """List all projects across all orgs where user has membership."""
    from accounts.models import OrganizationMembership

    org_ids = OrganizationMembership.objects.filter(
        user=user,
        is_active=True,
        organization__is_active=True,
    ).values_list("organization_id", flat=True)

    qs = Project.objects.filter(
        organization_id__in=org_ids,
    ).select_related("lead", "organization")

    if search:
        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        query = SearchQuery(search)
        return qs.annotate(rank=SearchRank(vector, query)).filter(rank__gte=0.01).order_by("-rank")

    return qs.order_by("sort_order", "-created_at")
```

**Step 4: Update `get_issue_by_identifier` → add `get_issue_by_id`**

In `backend/projects/selectors/issue_selector.py`, add:

```python
def get_issue_by_id(issue_id):
    return Issue.objects.filter(id=issue_id).select_related(
        "assignee", "reporter", "milestone", "cycle", "parent",
    ).prefetch_related("labels").first()
```

**Step 5: Commit**

```bash
git add backend/projects/permissions.py backend/projects/selectors/
git commit -m "refactor(backend): project permission resolves by UUID, add cross-org project listing"
```

---

## Task 7: Backend — Update project views (remove org_slug, use project_id)

**Files:**
- Modify: `backend/projects/views/project_views.py`
- Modify: `backend/projects/views/issue_views.py`
- Modify: `backend/projects/views/milestone_views.py`
- Modify: `backend/projects/views/cycle_views.py`
- Modify: `backend/projects/views/resource_views.py`

**Step 1: Update `ProjectListCreateView`**

- `GET` now uses `list_user_projects(request.user, search=search)` instead of `list_organization_projects(request.organization, search=search)`. Permission changes from `IsOrganizationMember` to `IsAuthenticated`.
- `POST` receives `organization_id` in the request body. Must validate org membership inline.

```python
class ProjectListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = request.query_params.get("q")
        projects = list_user_projects(request.user, search=search)
        return self.paginate(projects, ProjectListSerializer, request)

    def post(self, request):
        serializer = CreateProjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        org_id = serializer.validated_data.pop("organization_id")
        membership = get_membership(request.user, org_id)
        if membership is None or membership.role not in MANAGER_ROLES:
            return Response(
                {"detail": "You do not have permission to create projects in this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        project = create_project(
            organization=membership.organization,
            creator=request.user,
            **serializer.validated_data,
        )
        output = ProjectDetailSerializer(project).data
        return Response(output, status=status.HTTP_201_CREATED)
```

Add `organization_id = serializers.UUIDField()` to `CreateProjectSerializer`.

**Step 2: Update all other project views**

Replace method signatures: remove `org_slug` and `project_slug`, use `project_id` instead. All sub-resource views still use `IsProjectAccessible` which now resolves by UUID.

For `ProjectDetailView`:
- `def get(self, request, project_id):` → uses `request.project`
- `def put(self, request, project_id):` → uses `request.project`
- `def delete(self, request, project_id):` → uses `request.project`

For issue views, change `identifier` → `issue_id`. The `IssueDetailView` now looks up issue by UUID:

```python
def get(self, request, project_id, issue_id):
    issue = get_issue_by_id(issue_id)
    if issue is None or issue.project_id != request.project.id:
        raise NotFound("Issue not found.")
    ...
```

Same pattern for `IssueCommentListCreateView`, `IssueCommentDetailView`, `IssueActivityListView`, `MilestoneListCreateView`, `MilestoneDetailView`, `CycleListCreateView`, `CycleDetailView`, `ResourceListCreateView`, `ResourceDetailView`, `ProjectMemberListCreateView`, `ProjectMemberDetailView`, `ProjectSettingsView`.

**Step 3: Update workspace project team views**

In `backend/workspace/views/project_team_views.py`, update method signatures from `(self, request, org_slug, project_slug)` to `(self, request, project_id)`.

**Step 4: Commit**

```bash
git add backend/projects/views/ backend/projects/serializers/input.py backend/workspace/views/
git commit -m "refactor(backend): project views use UUID params, cross-org list"
```

---

## Task 8: Backend — Update project output serializers (add organization field)

**Files:**
- Modify: `backend/projects/serializers/output.py`

**Step 1: Add organization to project serializers**

Add a nested serializer for organization info:

```python
from organizations.serializers.output import OrganizationListSerializer

class ProjectListSerializer(serializers.ModelSerializer):
    lead = UserDetailSerializer(read_only=True)
    organization = OrganizationListSerializer(read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "slug",
            "organization",
            "status",
            "priority",
            "lead",
            "start_date",
            "target_date",
            "sort_order",
            "icon",
            "color",
            "created_at",
        ]
        read_only_fields = fields
```

Same for `ProjectDetailSerializer` — add `organization` field.

**Step 2: Commit**

```bash
git add backend/projects/serializers/output.py
git commit -m "feat(backend): include organization in project serializer output"
```

---

## Task 9: Backend — Update `workspace/urls.py` (team slug → UUID)

**Files:**
- Modify: `backend/workspace/urls.py`
- Modify: `backend/workspace/selectors/team_selector.py`
- Modify: `backend/workspace/views/team_views.py`

**Step 1: Update workspace URLs to use UUID for teams**

```python
urlpatterns = [
    # Labels
    path("labels/", LabelListCreateView.as_view(), name="workspace-label-list"),
    path("labels/<uuid:label_id>/", LabelDetailView.as_view(), name="workspace-label-detail"),
    # Teams
    path("teams/", TeamListCreateView.as_view(), name="workspace-team-list"),
    path("teams/<uuid:team_id>/", TeamDetailView.as_view(), name="workspace-team-detail"),
    path("teams/<uuid:team_id>/members/", TeamMemberListCreateView.as_view(), name="workspace-team-member-list"),
    path("teams/<uuid:team_id>/members/<uuid:user_id>/", TeamMemberDetailView.as_view(), name="workspace-team-member-detail"),
]
```

**Step 2: Add `get_team_by_id` selector and update views**

In `team_selector.py` add:
```python
def get_team_by_id(team_id):
    return Team.objects.filter(id=team_id, is_active=True).first()
```

Update all team views: change `team_slug` to `team_id` in method signatures and use `get_team_by_id(team_id)` instead of `get_team_by_slug(team_slug)`.

**Step 3: Commit**

```bash
git add backend/workspace/
git commit -m "refactor(backend): workspace team URLs use UUID"
```

---

## Task 10: Backend — Update `agents/urls.py` (slug → UUID)

**Files:**
- Modify: `backend/agents/urls.py`
- Modify: `backend/agents/views/` — all view files

**Step 1: Update agents URL patterns**

```python
urlpatterns = [
    path("subagents/", SubAgentListCreateView.as_view(), name="sub-agent-list-create"),
    path("subagents/<uuid:sub_agent_id>/", SubAgentDetailView.as_view(), name="sub-agent-detail"),
    path("subagents/<uuid:sub_agent_id>/skills/", SubAgentSkillListCreateView.as_view(), name="sub-agent-skill-list-create"),
    path("subagents/<uuid:sub_agent_id>/skills/<uuid:sub_agent_skill_id>/", SubAgentSkillDetailView.as_view(), name="sub-agent-skill-detail"),
    path("skills/", SkillListCreateView.as_view(), name="skill-list-create"),
    path("skills/<uuid:skill_id>/", SkillDetailView.as_view(), name="skill-detail"),
    path("skills/<uuid:skill_id>/versions/", SkillVersionListView.as_view(), name="skill-version-list"),
]
```

**Step 2: Update agent views**

Change all method signature kwargs from `sub_agent_slug` → `sub_agent_id` and `skill_slug` → `skill_id`. Update lookups to use `id` instead of `slug`.

**Step 3: Commit**

```bash
git add backend/agents/
git commit -m "refactor(backend): agents URLs use UUID"
```

---

## Task 11: Backend — Update `toony_agents/urls.py` (no org prefix, slug → UUID)

**Files:**
- Modify: `backend/toony_agents/urls.py`
- Modify: `backend/toony_agents/permissions.py`
- Modify: `backend/toony_agents/views/` — all view files

**Step 1: Update toony_agents URLs (no org prefix, UUID)**

Now mounted at `api/toony-agents/` (from config/urls.py). Internal URLs:

```python
urlpatterns = [
    path("", ToonyAgentListCreateView.as_view(), name="toony-agent-list-create"),
    path("<uuid:agent_id>/", ToonyAgentDetailView.as_view(), name="toony-agent-detail"),
    path("<uuid:agent_id>/keys/", ToonyAgentKeyListCreateView.as_view(), name="toony-agent-key-list-create"),
    path("<uuid:agent_id>/keys/<uuid:key_id>/", ToonyAgentKeyRevokeView.as_view(), name="toony-agent-key-revoke"),
    path("<uuid:agent_id>/tasks/", AgentTaskListCreateView.as_view(), name="agent-task-list-create"),
    path("<uuid:agent_id>/tasks/<uuid:task_id>/", AgentTaskDetailView.as_view(), name="agent-task-detail"),
    path("<uuid:agent_id>/tasks/<uuid:task_id>/cancel/", AgentTaskCancelView.as_view(), name="agent-task-cancel"),
    path("<uuid:agent_id>/tasks/<uuid:task_id>/events/", TaskEventListView.as_view(), name="task-event-list"),
]
```

**Step 2: Remove `IsToonyAgentOrgMember` permission class**

Toony agents are now global (no org in URL). Use `IsAuthenticated` and verify agent access inline in views (check agent.organizations M2M includes at least one org the user belongs to).

**Step 3: Update views**

Change `agent_slug` → `agent_id`, remove `org_slug`. Look up agent by UUID. Verify user has membership in at least one org the agent belongs to.

**Step 4: Commit**

```bash
git add backend/toony_agents/
git commit -m "refactor(backend): toony-agents URLs global with UUID, no org prefix"
```

---

## Task 12: Backend — Update `importers/urls.py` (org UUID)

**Files:**
- Modify: `backend/importers/urls.py`
- Modify: `backend/importers/views/` — update method signatures

**Step 1: Update importer URLs**

Importers stay org-scoped but use UUID. Since mounted at `api/` now:

```python
urlpatterns = [
    path("organizations/<uuid:org_id>/imports/", ImportJobListCreateView.as_view(), name="import-list-create"),
    path("organizations/<uuid:org_id>/imports/external-projects/", ExternalProjectsView.as_view(), name="external-projects"),
    path("organizations/<uuid:org_id>/imports/<uuid:job_id>/", ImportJobDetailView.as_view(), name="import-detail"),
    path("organizations/<uuid:org_id>/imports/<uuid:job_id>/mappings/", ImportJobMappingsView.as_view(), name="import-mappings"),
]
```

**Step 2: Update importer views — change `org_slug` → `org_id` in method signatures**

**Step 3: Commit**

```bash
git add backend/importers/
git commit -m "refactor(backend): importer URLs use org UUID"
```

---

## Task 13: Backend — Update all tests (new URL patterns)

**Files:**
- Modify: `backend/tests/test_organizations.py`
- Modify: `backend/tests/test_issues.py`
- Modify: `backend/tests/test_workspace.py`
- Modify: `backend/tests/test_toony_agents.py`

**Step 1: Update test_organizations.py**

Change base URL and helper functions:

```python
ORGS_URL = "/api/organizations/"

def org_url(org_id):
    return f"{ORGS_URL}{org_id}/"

def members_url(org_id):
    return f"{ORGS_URL}{org_id}/members/"

def member_url(org_id, user_id):
    return f"{ORGS_URL}{org_id}/members/{user_id}/"
```

Update all test calls: use `organization.id` instead of `organization.slug`.

**Step 2: Update test_issues.py**

```python
def issues_url(project_id):
    return f"/api/projects/{project_id}/issues/"

def issue_url(project_id, issue_id):
    return f"/api/projects/{project_id}/issues/{issue_id}/"

def comments_url(project_id, issue_id):
    return f"/api/projects/{project_id}/issues/{issue_id}/comments/"

def comment_url(project_id, issue_id, comment_id):
    return f"/api/projects/{project_id}/issues/{issue_id}/comments/{comment_id}/"
```

Update all test calls: use `project.id` instead of `organization.slug`/`project.slug`, and `issue.id` instead of `issue.identifier`.

**Step 3: Update test_workspace.py**

```python
LABELS_URL = "/api/workspace/labels/"
TEAMS_URL = "/api/workspace/teams/"

def team_url(team_id):
    return f"/api/workspace/teams/{team_id}/"

def team_members_url(team_id):
    return f"/api/workspace/teams/{team_id}/members/"
```

Update test calls: use `team.id` instead of `team.slug`.

**Step 4: Update test_toony_agents.py**

```python
def toony_agents_url():
    return "/api/toony-agents/"

def toony_agent_url(agent_id):
    return f"/api/toony-agents/{agent_id}/"

def keys_url(agent_id):
    return f"/api/toony-agents/{agent_id}/keys/"

def tasks_url(agent_id):
    return f"/api/toony-agents/{agent_id}/tasks/"
```

Update all API tests to use `agent.id` instead of `organization.slug`/`agent.slug`. Note: `test_nonmember_denied` test needs to be rethought — since no org in URL, the check is now done inside the view (agent must belong to at least one org the user is in).

**Step 5: Run all tests**

Run: `docker compose exec backend pytest tests/ -v`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add backend/tests/
git commit -m "test(backend): update all tests for new UUID-based URL patterns"
```

---

## Task 14: Backend — Update CLAUDE.md docs

**Files:**
- Modify: `backend/CLAUDE.md`

**Step 1: Update API Routes section**

Replace the API Routes section with the new URL structure (no `/v1/`, UUIDs instead of slugs, projects at top level, etc.).

**Step 2: Update the single test example command**

```bash
docker compose exec backend pytest tests/test_issues.py::TestIssueAPI::test_create_issue -v
```

**Step 3: Commit**

```bash
git add backend/CLAUDE.md
git commit -m "docs(backend): update CLAUDE.md with new URL patterns"
```

---

## Task 15: Frontend — Update `lib/api.ts` base URL

**Files:**
- Modify: `frontend/lib/api.ts`

**Step 1: Change baseURL**

```typescript
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
});
```

**Step 2: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "refactor(frontend): update API base URL to /api (drop /v1)"
```

---

## Task 16: Frontend — Update all API service modules

**Files:**
- Modify: `frontend/lib/api/organizations.ts`
- Modify: `frontend/lib/api/members.ts`
- Modify: `frontend/lib/api/settings.ts`
- Modify: `frontend/lib/api/credentials.ts`
- Modify: `frontend/lib/api/integrations.ts`
- Modify: `frontend/lib/api/imports.ts`
- Modify: `frontend/lib/api/projects.ts`
- Modify: `frontend/lib/api/milestones.ts`
- Modify: `frontend/lib/api/cycles.ts`
- Modify: `frontend/lib/api/issues.ts`
- Modify: `frontend/lib/api/resources.ts`
- Modify: `frontend/lib/api/project-teams.ts`
- Modify: `frontend/lib/api/workspace.ts`
- Modify: `frontend/lib/api/sub-agents.ts`
- Modify: `frontend/lib/api/sub-agent-skills.ts`
- Modify: `frontend/lib/api/skills.ts`
- Modify: `frontend/lib/api/toony-agents.ts`
- Modify: `frontend/lib/api/search.ts`

**Step 1: Update `organizations.ts`** — `getOrganization(id)`, `updateOrganization(id, payload)`, `deleteOrganization(id)` — change slug param to id.

**Step 2: Update `members.ts`** — `orgSlug` → `orgId` in all functions.

**Step 3: Update `settings.ts`** — `orgSlug` → `orgId`.

**Step 4: Update `credentials.ts`** — `orgSlug` → `orgId`.

**Step 5: Update `integrations.ts`** — `orgSlug` → `orgId`.

**Step 6: Update `imports.ts`** — `orgSlug` → `orgId`.

**Step 7: Update `projects.ts`** — Remove `orgSlug` from all functions. `listProjects()` takes no org param. `createProject(payload)` sends `organization_id` in body. Detail/update/delete use `projectId` (UUID). Members/settings also drop orgSlug.

```typescript
export async function listProjects(cursor?: string): Promise<PaginatedResponse<ProjectList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectList>>("/projects/", { params });
  return data;
}

export async function createProject(payload: CreateProjectPayload): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>("/projects/", payload);
  return data;
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(`/projects/${projectId}/`);
  return data;
}
// ... same pattern for update, delete, members, settings
```

**Step 8: Update `milestones.ts`** — Remove `orgSlug`. Use `projectId` only: `/projects/${projectId}/milestones/`.

**Step 9: Update `cycles.ts`** — Same as milestones.

**Step 10: Update `issues.ts`** — Remove `orgSlug`. Use `projectId` and `issueId` (UUID): `/projects/${projectId}/issues/${issueId}/`.

**Step 11: Update `resources.ts`** — Remove `orgSlug`.

**Step 12: Update `project-teams.ts`** — Remove `orgSlug`.

**Step 13: Update `workspace.ts`** — Teams use `teamId` (UUID) instead of `teamSlug`: `/workspace/teams/${teamId}/`.

**Step 14: Update `sub-agents.ts`** — Use `subAgentId` (UUID) instead of `subAgentSlug`: `/subagents/${subAgentId}/`.

**Step 15: Update `sub-agent-skills.ts`** — Use `subAgentId` instead of `subAgentSlug`.

**Step 16: Update `skills.ts`** — Use `skillId` instead of `skillSlug`: `/skills/${skillId}/`.

**Step 17: Update `toony-agents.ts`** — Remove `orgSlug`. Use `agentId` (UUID) instead of `agentSlug`: `/toony-agents/${agentId}/`.

**Step 18: Update `search.ts`** — Remove `orgSlug`. Route: `/search/?q=`.

**Step 19: Commit**

```bash
git add frontend/lib/api/
git commit -m "refactor(frontend): update all API modules for new URL patterns"
```

---

## Task 17: Frontend — Update TypeScript types

**Files:**
- Modify: `frontend/types/projects.ts`
- Modify: `frontend/types/organization.ts`

**Step 1: Add `organization` to project types**

In `ProjectList`:
```typescript
export interface ProjectList {
  id: string;
  name: string;
  slug: string;
  organization: Organization;  // NEW
  status: ProjectStatus;
  // ... rest unchanged
}
```

Add `organization_id: string` to `CreateProjectPayload`.

**Step 2: Commit**

```bash
git add frontend/types/
git commit -m "refactor(frontend): update types for org-in-project and new payloads"
```

---

## Task 18: Frontend — Remove OrgContext and OrgSwitcher

**Files:**
- Delete: `frontend/contexts/org-context.tsx`
- Delete: `frontend/components/org-switcher.tsx`
- Modify: `frontend/components/sidebar.tsx`

**Step 1: Remove OrgContext**

Delete the file entirely. It's no longer needed — there's no "current org" concept.

**Step 2: Remove OrgSwitcher**

Delete the file entirely.

**Step 3: Update Sidebar**

Remove the `OrgSwitcher` import and rendering. Remove `useOrg()` usage. Update `NAV_ITEMS`:

```typescript
const NAV_ITEMS: (NavItem | NavGroup)[] = [
  { label: "Dashboard", path: "", icon: LayoutDashboard },
  { label: "Organizations", path: "/organizations", icon: Building2 },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Teams", path: "/teams", icon: Users },
  { label: "Labels", path: "/labels", icon: Tag },
  {
    label: "AI Studio",
    icon: Bot,
    children: [
      { label: "Sub-Agents", path: "/subagents", icon: Bot },
      { label: "Skills", path: "/skills", icon: Zap },
      { label: "Toony Agents", path: "/toony-agents", icon: Terminal },
    ],
  },
];
```

Remove Members, Imports, Credentials, Settings from sidebar nav (these move into org detail tabs).

Update link generation: no more `/${currentOrg.slug}` prefix. Links are just the path directly.

**Step 4: Commit**

```bash
git add frontend/contexts/ frontend/components/sidebar.tsx
git rm frontend/contexts/org-context.tsx frontend/components/org-switcher.tsx
git commit -m "refactor(frontend): remove OrgContext and OrgSwitcher, update sidebar nav"
```

---

## Task 19: Frontend — Restructure route groups (drop [orgSlug])

**Files:**
- Move: `frontend/app/(dashboard)/[orgSlug]/` → `frontend/app/(dashboard)/`
- Modify: `frontend/app/(dashboard)/layout.tsx` (new, without OrgProvider)
- Modify: `frontend/app/page.tsx` (root page — simplify redirect)

**Step 1: Create new dashboard layout**

```typescript
"use client";

import Sidebar from "@/components/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden p-6">
        {children}
      </main>
    </div>
  );
}
```

No `OrgProvider` wrapping.

**Step 2: Move all page files**

Move every page from `app/(dashboard)/[orgSlug]/X/page.tsx` to `app/(dashboard)/X/page.tsx`. This includes:
- `projects/`, `teams/`, `labels/`, `subagents/`, `skills/`, `toony-agents/`
- Create new: `organizations/` (page.tsx, new/page.tsx, [id]/page.tsx)
- Delete: `members/page.tsx`, `settings/page.tsx`, `credentials/page.tsx`, `imports/page.tsx` (these become tabs in org detail)

**Step 3: Update root page.tsx**

Remove org selection logic. Authenticated users go directly to `/projects`:

```typescript
"use client";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace("/projects");
      }
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LandingPage />;
  return null;
}
```

**Step 4: Update `[orgSlug]/layout.tsx` → delete it**

The old `[orgSlug]/layout.tsx` wrapping OrgProvider is no longer needed.

**Step 5: Commit**

```bash
git add frontend/app/
git commit -m "refactor(frontend): restructure routes to flat paths, drop [orgSlug]"
```

---

## Task 20: Frontend — Update all page components (remove orgSlug dependencies)

**Files:**
- Modify: Every page.tsx under `frontend/app/(dashboard)/`

**Step 1: Global search-and-replace in all pages**

In every page file:
1. Remove `useOrg()` imports and calls
2. Remove `const { orgSlug } = useParams()` or `params.orgSlug`
3. Remove `currentOrg`, `currentMembership` references
4. Update API calls to use new function signatures (no orgSlug)
5. Update `router.push()` calls — remove `/${orgSlug}` prefix
6. For pages that need org info (like project detail), get it from the API response (project.organization)

**This is the largest step.** Each page needs individual attention. Key pages:

- **projects/page.tsx** — Now calls `listProjects()` (no orgSlug). Renders cards instead of table.
- **projects/[id]/page.tsx** — Was `[projectSlug]/page.tsx`. Use `params.id` (UUID). Call `getProject(id)`.
- **projects/[id]/issues/[id]/page.tsx** — Was `issues/[identifier]/page.tsx`. Use issue UUID.
- **teams/page.tsx** — Already uses `/workspace/teams/` without org. May only need link updates.
- **teams/[id]/page.tsx** — Was `[teamSlug]/page.tsx`. Use `params.id` (UUID).
- **labels/page.tsx** — Likely minimal changes (workspace-scoped).
- **subagents/, skills/, toony-agents/** — Update slug params to id params.

**Step 2: Commit per logical group**

```bash
git add frontend/app/(dashboard)/projects/
git commit -m "refactor(frontend): projects pages use flat routes and UUIDs"

git add frontend/app/(dashboard)/teams/ frontend/app/(dashboard)/labels/
git commit -m "refactor(frontend): teams and labels pages use UUIDs"

git add frontend/app/(dashboard)/subagents/ frontend/app/(dashboard)/skills/ frontend/app/(dashboard)/toony-agents/
git commit -m "refactor(frontend): AI studio pages use UUIDs"
```

---

## Task 21: Frontend — Create Organizations page (list + cards)

**Files:**
- Create: `frontend/app/(dashboard)/organizations/page.tsx`

**Step 1: Build organizations list page**

Page shows a responsive grid of org cards. Each card shows: name, slug, description (truncated), member_count, created_at. Has a "Create Organization" button linking to `/organizations/new`. Click card → `/organizations/{id}`.

**Step 2: Commit**

```bash
git add frontend/app/(dashboard)/organizations/page.tsx
git commit -m "feat(frontend): add organizations list page with cards"
```

---

## Task 22: Frontend — Create Organization form page

**Files:**
- Create: `frontend/app/(dashboard)/organizations/new/page.tsx`

**Step 1: Build create organization page**

Full page form (not modal). Fields: name, slug (auto-derived), description, website, industry. On submit → `createOrganization(payload)`. On success → redirect to `/organizations/{id}`.

**Step 2: Commit**

```bash
git add frontend/app/(dashboard)/organizations/new/page.tsx
git commit -m "feat(frontend): add create organization page"
```

---

## Task 23: Frontend — Create Organization detail page (tabs)

**Files:**
- Create: `frontend/app/(dashboard)/organizations/[id]/page.tsx`

**Step 1: Build org detail page with tabs**

Six tabs: General, Members, Settings, Credentials, Integrations, Imports.

Migrate existing page content:
- **General tab**: Inline-editable org info (name, description, website, industry). From old org dashboard + settings.
- **Members tab**: From `members/page.tsx`. Use `orgId` from URL params.
- **Settings tab**: From `settings/page.tsx`. Use `orgId`.
- **Credentials tab**: From `credentials/page.tsx` (credentials portion). Use `orgId`.
- **Integrations tab**: From `credentials/page.tsx` (integrations portion). Use `orgId`.
- **Imports tab**: From `imports/page.tsx`. Use `orgId`.

**Step 2: Commit**

```bash
git add frontend/app/(dashboard)/organizations/[id]/page.tsx
git commit -m "feat(frontend): add org detail page with tabs (general, members, settings, credentials, integrations, imports)"
```

---

## Task 24: Frontend — Projects page as cards

**Files:**
- Modify: `frontend/app/(dashboard)/projects/page.tsx`

**Step 1: Convert projects list from table to cards**

Responsive grid of project cards showing:
- Project name (bold)
- Organization name (badge/chip)
- Status (colored badge: BACKLOG=gray, PLANNED=blue, IN_PROGRESS=yellow, etc.)
- Priority (icon + text)
- Lead (avatar + name, or "Unassigned")
- Target date (formatted, or "No target")

Clicking a card navigates to `/projects/{id}`.

Add filter controls for: organization (dropdown of user's orgs), status, priority.

**Step 2: Commit**

```bash
git add frontend/app/(dashboard)/projects/page.tsx
git commit -m "feat(frontend): projects page with card grid and cross-org listing"
```

---

## Task 25: Frontend — Create Project page (standalone form)

**Files:**
- Create: `frontend/app/(dashboard)/projects/new/page.tsx`
- Delete: `frontend/components/create-project-modal.tsx`

**Step 1: Build create project full page**

Full page form. Fields:
- Organization (required, dropdown from `listOrganizations()`)
- Name (auto-generates slug)
- Slug (editable)
- Short summary (optional)
- Description (required)
- Status (select: BACKLOG / PLANNED / IN_PROGRESS)
- Priority (select: NONE / URGENT / HIGH / MEDIUM / LOW)
- Start date, Target date

On submit → `createProject({ organization_id, name, slug, ... })`.
On success → redirect to `/projects/{id}`.

**Step 2: Delete old CreateProjectModal**

**Step 3: Commit**

```bash
git add frontend/app/(dashboard)/projects/new/page.tsx
git rm frontend/components/create-project-modal.tsx
git commit -m "feat(frontend): create project as standalone page with org selector"
```

---

## Task 26: Frontend — Update middleware and auth redirect

**Files:**
- Modify: `frontend/middleware.ts`

**Step 1: Update middleware**

No org-specific routing. The middleware just checks auth cookie and redirects:
- Authenticated on `/login` or `/register` → redirect to `/`
- Unauthenticated on protected routes → redirect to `/login?redirect=<path>`

This should be mostly unchanged since middleware doesn't reference orgSlug. Just verify no org-specific logic.

**Step 2: Commit**

```bash
git add frontend/middleware.ts
git commit -m "refactor(frontend): simplify middleware (no org routing)"
```

---

## Task 27: Frontend — Update SearchCommandPalette

**Files:**
- Modify: `frontend/components/search-command-palette.tsx` (or wherever it is)

**Step 1: Update search to use global endpoint**

Change from `globalSearch(orgSlug, query)` to `globalSearch(query)` which hits `/search/?q=`.

Update result links to use flat paths: `/projects/{id}`, `/teams/{id}`, etc.

**Step 2: Commit**

```bash
git add frontend/components/
git commit -m "refactor(frontend): search uses global endpoint without org scope"
```

---

## Task 28: Frontend — Update WebSocket hooks

**Files:**
- Modify: `frontend/hooks/use-project-websocket.ts`
- Modify: `frontend/hooks/use-agent-websocket.ts`

**Step 1: Verify WebSocket hooks**

WebSocket routes already use UUIDs (`ws/projects/<uuid>/`, `ws/subagents/<uuid>/`). These should not need org_slug changes. Just verify there are no orgSlug references in the hook usage or URL construction.

**Step 2: Commit (if changes needed)**

```bash
git add frontend/hooks/
git commit -m "refactor(frontend): verify websocket hooks use UUID paths"
```

---

## Task 29: Frontend — Update CLAUDE.md and environment variables

**Files:**
- Modify: `frontend/CLAUDE.md`
- Modify: `frontend/.env.example` (if exists)
- Modify: `CLAUDE.md` (root)

**Step 1: Update `NEXT_PUBLIC_API_URL` default**

Change from `http://localhost:8000/api/v1` to `http://localhost:8000/api` in docs and `.env.example`.

**Step 2: Update route structure documentation**

Replace the route structure in CLAUDE.md files to reflect flat paths.

**Step 3: Commit**

```bash
git add CLAUDE.md frontend/CLAUDE.md
git commit -m "docs: update CLAUDE.md files with new route structure"
```

---

## Task 30: Full integration verification

**Step 1: Run backend tests**

```bash
docker compose exec backend pytest tests/ -v
```
Expected: All PASS

**Step 2: Run frontend lint**

```bash
docker compose exec frontend ./node_modules/.bin/next lint
```
Expected: No errors

**Step 3: Run frontend build**

```bash
docker compose exec frontend ./node_modules/.bin/next build
```
Expected: Build succeeds

**Step 4: Manual smoke test**

Start services with `make up`. Verify:
1. Login works
2. Authenticated user redirects to `/projects`
3. Organizations page lists all orgs
4. Create org works
5. Org detail shows all tabs
6. Projects page shows cross-org cards
7. Create project with org selector works
8. Project detail, issues, milestones, cycles all work
9. Teams, labels work
10. Sub-agents, skills, toony-agents work
11. Search works

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: final integration fixes for org scope removal"
```

---

## Task 31: Update project memory

**Files:**
- Modify: `/Users/LuisMo/.claude/projects/-Users-LuisMo-Documents-projects-toony-dev-core/memory/MEMORY.md`

**Step 1: Update memory with new patterns**

Update API endpoints section, frontend structure, key patterns to reflect:
- No `/v1/` prefix
- All URLs use UUIDs
- Flat frontend routes (no `[orgSlug]`)
- No OrgContext/OrgSwitcher
- Projects listed cross-org
- Org detail page with tabs

**Step 2: Commit memory**

No git commit needed for memory files.
