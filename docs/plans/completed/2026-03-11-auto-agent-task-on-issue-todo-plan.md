# Auto-create AgentTask on Issue BACKLOG→TODO — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an issue transitions from BACKLOG to TODO, auto-create an AgentTask assigned to the most recently connected ToonyAgent in the issue's organization.

**Architecture:** Add `issue` FK to AgentTask, add `auto_task_prompt_template` to ProjectSettings, add `DEFAULT_AGENT_TASK_PROMPT_TEMPLATE` env var in Django settings, wire trigger logic inline in `update_issue` service.

**Tech Stack:** Django 5, DRF, pytest, factory_boy

---

### Task 1: Add `issue` FK to AgentTask model

**Files:**
- Modify: `backend/apps/toony_agents/models/agent_task.py`

**Step 1: Add the `issue` field to the AgentTask model**

In `backend/apps/toony_agents/models/agent_task.py`, add this field to the `AgentTask` class, after the `project` FK:

```python
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agent_tasks",
    )
```

**Step 2: Generate migration**

Run: `docker compose exec backend python manage.py makemigrations toony_agents`

Expected: A new migration file is created (e.g., `XXXX_agenttask_issue.py`).

**Step 3: Apply migration**

Run: `docker compose exec backend python manage.py migrate`

Expected: Migration applies successfully.

**Step 4: Commit**

```bash
git add backend/apps/toony_agents/models/agent_task.py backend/apps/toony_agents/migrations/
git commit -m "feat: add issue FK to AgentTask model"
```

---

### Task 2: Add `auto_task_prompt_template` to ProjectSettings model

**Files:**
- Modify: `backend/apps/projects/models/project.py`

**Step 1: Add the field to ProjectSettings**

In `backend/apps/projects/models/project.py`, add this field to `ProjectSettings` after `estimation_method`:

```python
    auto_task_prompt_template = models.TextField(blank=True, default="")
```

**Step 2: Generate migration**

Run: `docker compose exec backend python manage.py makemigrations projects`

Expected: A new migration file is created.

**Step 3: Apply migration**

Run: `docker compose exec backend python manage.py migrate`

Expected: Migration applies successfully.

**Step 4: Commit**

```bash
git add backend/apps/projects/models/project.py backend/apps/projects/migrations/
git commit -m "feat: add auto_task_prompt_template to ProjectSettings"
```

---

### Task 3: Add `DEFAULT_AGENT_TASK_PROMPT_TEMPLATE` to Django settings

**Files:**
- Modify: `backend/config/settings/base.py`

**Step 1: Add the setting**

At the bottom of `backend/config/settings/base.py`, add:

```python
# Agent Task Automation
DEFAULT_AGENT_TASK_PROMPT_TEMPLATE = os.environ.get(
    "DEFAULT_AGENT_TASK_PROMPT_TEMPLATE",
    "Use toony skill and implement {issue_identifier}",
)
```

**Step 2: Commit**

```bash
git add backend/config/settings/base.py
git commit -m "feat: add DEFAULT_AGENT_TASK_PROMPT_TEMPLATE setting"
```

---

### Task 4: Update `create_agent_task` service to accept `issue` param

**Files:**
- Modify: `backend/apps/toony_agents/services/agent_task_service.py`

**Step 1: Add `issue` parameter**

In `backend/apps/toony_agents/services/agent_task_service.py`, update the `create_agent_task` function signature and body:

Change the signature from:
```python
def create_agent_task(organization, toony_agent, created_by, title, prompt, project=None):
```
to:
```python
def create_agent_task(organization, toony_agent, created_by, title, prompt, project=None, issue=None):
```

In the `AgentTask.objects.create(...)` call, add `issue=issue` after `project=project`:
```python
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=toony_agent,
            title=title,
            prompt=prompt,
            created_by=created_by,
            project=project,
            issue=issue,
        )
```

**Step 2: Commit**

```bash
git add backend/apps/toony_agents/services/agent_task_service.py
git commit -m "feat: accept issue param in create_agent_task service"
```

---

### Task 5: Write the auto-task creation test

**Files:**
- Create: `backend/tests/test_auto_agent_task.py`

**Step 1: Write the test file**

Create `backend/tests/test_auto_agent_task.py`:

```python
import pytest
from django.test.utils import override_settings
from unittest.mock import patch

from projects.models import IssueStatus
from projects.services import update_issue
from toony_agents.models import AgentTask

pytestmark = pytest.mark.django_db

DEFAULT_TEMPLATE = "Use toony skill and implement {issue_identifier}"


class TestAutoAgentTaskCreation:
    """Tests for auto-creating AgentTask when issue moves BACKLOG→TODO."""

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_backlog_to_todo_creates_agent_task(self, issue, toony_agent, user):
        """Moving issue from BACKLOG to TODO creates an AgentTask."""
        assert issue.status == IssueStatus.BACKLOG

        update_issue(issue, user, status=IssueStatus.TODO)

        task = AgentTask.objects.filter(issue=issue).first()
        assert task is not None
        assert task.organization == issue.project.organization
        assert task.project == issue.project
        assert task.issue == issue
        assert task.toony_agent == toony_agent
        assert task.title == issue.title
        assert task.prompt == f"Use toony skill and implement {issue.identifier}"
        assert task.created_by == user

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_in_progress_does_not_create_task(self, issue, toony_agent, user):
        """Only BACKLOG→TODO triggers auto-creation, not other transitions."""
        issue.status = IssueStatus.TODO
        issue.save()

        update_issue(issue, user, status=IssueStatus.IN_PROGRESS)

        assert AgentTask.objects.filter(issue=issue).count() == 0

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_no_toony_agent_for_org_skips_creation(self, issue, user):
        """If no ToonyAgent is associated with the org, no task is created."""
        update_issue(issue, user, status=IssueStatus.TODO)

        assert AgentTask.objects.filter(issue=issue).count() == 0

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_picks_most_recently_connected_agent(self, issue, user, organization):
        """Selects the ToonyAgent with the most recent last_connected_at."""
        from django.utils import timezone
        from tests.factories import ToonyAgentFactory

        old_agent = ToonyAgentFactory(last_connected_at=timezone.now() - timezone.timedelta(days=2))
        old_agent.organizations.add(organization)

        new_agent = ToonyAgentFactory(last_connected_at=timezone.now())
        new_agent.organizations.add(organization)

        update_issue(issue, user, status=IssueStatus.TODO)

        task = AgentTask.objects.get(issue=issue)
        assert task.toony_agent == new_agent

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_project_template_overrides_default(self, issue, toony_agent, user):
        """ProjectSettings.auto_task_prompt_template overrides env var."""
        settings_obj = issue.project.settings
        settings_obj.auto_task_prompt_template = "Custom: {issue_id}"
        settings_obj.save()

        update_issue(issue, user, status=IssueStatus.TODO)

        task = AgentTask.objects.get(issue=issue)
        assert task.prompt == f"Custom: {issue.id}"

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE="")
    def test_no_template_configured_skips_creation(self, issue, toony_agent, user):
        """If neither project nor env var has a template, no task is created."""
        update_issue(issue, user, status=IssueStatus.TODO)

        assert AgentTask.objects.filter(issue=issue).count() == 0

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_issue_status_changes_even_if_no_agent(self, issue, user):
        """The issue status update succeeds regardless of agent availability."""
        update_issue(issue, user, status=IssueStatus.TODO)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO
```

**Step 2: Run the tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_auto_agent_task.py -v`

Expected: All 7 tests FAIL (the auto-creation logic doesn't exist yet).

**Step 3: Commit**

```bash
git add backend/tests/test_auto_agent_task.py
git commit -m "test: add failing tests for auto agent task creation"
```

---

### Task 6: Implement the auto-task trigger in `update_issue`

**Files:**
- Modify: `backend/apps/projects/services/issue_service.py`

**Step 1: Add the auto-task creation logic**

In `backend/apps/projects/services/issue_service.py`:

1. Add imports at the top of the file (after existing imports):

```python
import logging

logger = logging.getLogger(__name__)
```

2. Inside the `update_issue` function, **before** the `with transaction.atomic():` block, capture the old status:

```python
    old_status = issue.status
```

3. **After** the `broadcast(...)` call at the end of `update_issue` (outside the transaction), add the auto-task trigger:

```python
    # Auto-create AgentTask when issue transitions BACKLOG → TODO
    if old_status == IssueStatus.BACKLOG and issue.status == IssueStatus.TODO:
        _maybe_create_agent_task(issue, user)
```

4. Add the helper function at the bottom of the file:

```python
def _maybe_create_agent_task(issue, user):
    """Auto-create an AgentTask when an issue moves from BACKLOG to TODO."""
    from django.conf import settings as django_settings

    from toony_agents.models import ToonyAgent
    from toony_agents.services.agent_task_service import create_agent_task

    organization = issue.project.organization

    # Find the most recently connected ToonyAgent for this org
    agent = (
        ToonyAgent.objects.filter(organizations=organization)
        .order_by("-last_connected_at")
        .first()
    )
    if agent is None:
        logger.warning(
            "No ToonyAgent found for organization %s; skipping auto-task for issue %s",
            organization.id,
            issue.identifier,
        )
        return

    # Resolve prompt template: project override > env var
    template = ""
    try:
        project_settings = issue.project.settings
        template = project_settings.auto_task_prompt_template or ""
    except issue.project.__class__.settings.RelatedObjectDoesNotExist:
        pass

    if not template:
        template = getattr(django_settings, "DEFAULT_AGENT_TASK_PROMPT_TEMPLATE", "")

    if not template:
        logger.warning(
            "No prompt template configured for project %s or env; skipping auto-task for issue %s",
            issue.project_id,
            issue.identifier,
        )
        return

    prompt = template.format(
        issue_id=issue.id,
        issue_identifier=issue.identifier,
    )

    create_agent_task(
        organization=organization,
        toony_agent=agent,
        created_by=user,
        title=issue.title,
        prompt=prompt,
        project=issue.project,
        issue=issue,
    )
```

**Step 2: Run the tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_auto_agent_task.py -v`

Expected: All 7 tests PASS.

**Step 3: Run the full test suite**

Run: `docker compose exec backend pytest -v`

Expected: All tests pass (no regressions).

**Step 4: Commit**

```bash
git add backend/apps/projects/services/issue_service.py
git commit -m "feat: auto-create AgentTask when issue moves BACKLOG→TODO"
```

---

### Task 7: Update serializers and input validation for new fields

**Files:**
- Modify: `backend/apps/toony_agents/serializers/output.py`
- Modify: `backend/apps/projects/serializers/output.py`
- Modify: `backend/apps/projects/serializers/input.py`
- Modify: `backend/apps/projects/services/project_service.py`

**Step 1: Add `issue` to AgentTask serializers**

In `backend/apps/toony_agents/serializers/output.py`:

In `AgentTaskListSerializer`, add `issue` to fields and a `get_issue` method:

```python
class AgentTaskListSerializer(serializers.ModelSerializer):
    toony_agent_slug = serializers.CharField(
        source="toony_agent.slug",
        default=None,
    )
    organization = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()
    issue = serializers.SerializerMethodField()

    class Meta:
        model = AgentTask
        fields = [
            "id",
            "title",
            "status",
            "toony_agent_slug",
            "organization",
            "project",
            "issue",
            "started_at",
            "completed_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_organization(self, obj):
        if not obj.organization:
            return None
        return {"id": str(obj.organization.id), "name": obj.organization.name}

    def get_project(self, obj):
        if not obj.project:
            return None
        return {"id": str(obj.project.id), "name": obj.project.name}

    def get_issue(self, obj):
        if not obj.issue:
            return None
        return {"id": str(obj.issue.id), "identifier": obj.issue.identifier, "title": obj.issue.title}
```

In `AgentTaskDetailSerializer`, add `issue` to fields and a `get_issue` method (same pattern):

```python
    issue = serializers.SerializerMethodField()
```

Add to `fields` list after `"project"`:
```python
            "issue",
```

Add the method:
```python
    def get_issue(self, obj):
        if not obj.issue:
            return None
        return {"id": str(obj.issue.id), "identifier": obj.issue.identifier, "title": obj.issue.title}
```

**Step 2: Add `auto_task_prompt_template` to ProjectSettings serializers**

In `backend/apps/projects/serializers/output.py`, in `ProjectSettingsSerializer`, add `"auto_task_prompt_template"` to the `fields` list (before `"updated_at"`).

In `backend/apps/projects/serializers/input.py`, in `UpdateProjectSettingsSerializer`, add:

```python
    auto_task_prompt_template = serializers.CharField(
        required=False,
        allow_blank=True,
    )
```

**Step 3: Update `update_project_settings` service**

In `backend/apps/projects/services/project_service.py`, add `"auto_task_prompt_template"` to the `allowed_fields` set in `update_project_settings`:

```python
    allowed_fields = {
        "repository_url",
        "default_branch",
        "branch_naming_convention",
        "required_reviewers_count",
        "auto_close_completed_issues",
        "issue_prefix",
        "estimation_method",
        "auto_task_prompt_template",
    }
```

**Step 4: Run the full test suite**

Run: `docker compose exec backend pytest -v`

Expected: All tests pass.

**Step 5: Commit**

```bash
git add backend/apps/toony_agents/serializers/output.py backend/apps/projects/serializers/output.py backend/apps/projects/serializers/input.py backend/apps/projects/services/project_service.py
git commit -m "feat: expose issue on AgentTask and auto_task_prompt_template on ProjectSettings"
```

---

### Task 8: Run lint and final verification

**Step 1: Run linter**

Run: `docker compose exec backend ruff check .`

Expected: No lint errors. If there are, fix them.

**Step 2: Run full test suite one more time**

Run: `docker compose exec backend pytest -v`

Expected: All tests pass.

**Step 3: Commit any lint fixes**

If needed:
```bash
git add -u
git commit -m "style: fix lint issues"
```
