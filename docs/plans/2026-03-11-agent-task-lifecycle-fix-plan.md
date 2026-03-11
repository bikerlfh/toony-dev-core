# AgentTask Lifecycle Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an issue moves TODO→BACKLOG, cancel QUEUED agent tasks automatically and block the transition if any agent task is ASSIGNED/RUNNING/WAITING_FOR_ANSWER.

**Architecture:** Add a `_handle_todo_to_backlog` helper in `issue_service.py` that checks/cancels agent tasks before the status change. Called from `update_issue` alongside the existing `_maybe_create_agent_task` trigger. Validation runs before the transaction so the issue status is never changed if blocked.

**Tech Stack:** Django 5, DRF, pytest, factory_boy

---

### Task 1: Write tests for TODO→BACKLOG lifecycle

**Files:**
- Modify: `backend/tests/test_auto_agent_task.py`

**Step 1: Add new test class to the existing test file**

Append this class at the bottom of `backend/tests/test_auto_agent_task.py`:

```python
class TestAgentTaskLifecycleOnStatusChange:
    """Tests for AgentTask lifecycle when issue status changes."""

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_cancels_queued_task(self, issue, toony_agent, user):
        """Moving issue TODO→BACKLOG cancels QUEUED agent tasks."""
        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        assert task.status == "QUEUED"

        update_issue(issue, user, status=IssueStatus.BACKLOG)

        task.refresh_from_db()
        assert task.status == "CANCELLED"

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_blocks_if_task_assigned(self, issue, toony_agent, user):
        """Cannot move issue TODO→BACKLOG if agent task is ASSIGNED."""
        from rest_framework.exceptions import ValidationError

        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "ASSIGNED"
        task.save()

        with pytest.raises(ValidationError, match="AgentTask"):
            update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_blocks_if_task_running(self, issue, toony_agent, user):
        """Cannot move issue TODO→BACKLOG if agent task is RUNNING."""
        from rest_framework.exceptions import ValidationError

        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "RUNNING"
        task.save()

        with pytest.raises(ValidationError, match="AgentTask"):
            update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_blocks_if_task_waiting(self, issue, toony_agent, user):
        """Cannot move issue TODO→BACKLOG if agent task is WAITING_FOR_ANSWER."""
        from rest_framework.exceptions import ValidationError

        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "WAITING_FOR_ANSWER"
        task.save()

        with pytest.raises(ValidationError, match="AgentTask"):
            update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.TODO

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_todo_to_backlog_allows_if_task_completed(self, issue, toony_agent, user):
        """Can move issue TODO→BACKLOG if agent task is already COMPLETED."""
        update_issue(issue, user, status=IssueStatus.TODO)
        task = AgentTask.objects.get(issue=issue)
        task.status = "COMPLETED"
        task.save()

        update_issue(issue, user, status=IssueStatus.BACKLOG)

        issue.refresh_from_db()
        assert issue.status == IssueStatus.BACKLOG

    @override_settings(DEFAULT_AGENT_TASK_PROMPT_TEMPLATE=DEFAULT_TEMPLATE)
    def test_backlog_todo_backlog_todo_creates_new_task(self, issue, toony_agent, user):
        """Full cycle: BACKLOG→TODO→BACKLOG→TODO creates a new task each time."""
        update_issue(issue, user, status=IssueStatus.TODO)
        first_task = AgentTask.objects.get(issue=issue, status="QUEUED")

        update_issue(issue, user, status=IssueStatus.BACKLOG)
        first_task.refresh_from_db()
        assert first_task.status == "CANCELLED"

        update_issue(issue, user, status=IssueStatus.TODO)
        queued_tasks = AgentTask.objects.filter(issue=issue, status="QUEUED")
        assert queued_tasks.count() == 1
        assert queued_tasks.first().id != first_task.id
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_auto_agent_task.py::TestAgentTaskLifecycleOnStatusChange -v`

Expected: All 6 new tests FAIL (the lifecycle logic doesn't exist yet).

**Step 3: Commit**

```bash
git add backend/tests/test_auto_agent_task.py
git commit -m "test: add failing tests for AgentTask lifecycle on issue status changes"
```

---

### Task 2: Implement TODO→BACKLOG lifecycle logic

**Files:**
- Modify: `backend/apps/projects/services/issue_service.py`

**Step 1: Add the lifecycle check in `update_issue`**

In `backend/apps/projects/services/issue_service.py`, in the `update_issue` function, add a new block **after** `old_status = issue.status` (line 57) and **before** the `tracked_fields` dict (line 59):

```python
    # Block TODO→BACKLOG if active agent tasks exist; cancel QUEUED ones
    new_status = kwargs.get("status")
    if old_status == IssueStatus.TODO and new_status == IssueStatus.BACKLOG:
        _handle_todo_to_backlog(issue)
```

**Step 2: Add the `_handle_todo_to_backlog` helper**

Add this function right before `_maybe_create_agent_task` (before line 209):

```python
def _handle_todo_to_backlog(issue):
    """Cancel QUEUED agent tasks or block if any are actively running."""
    from toony_agents.models import AgentTaskStatus
    from toony_agents.services.agent_task_service import update_task_status

    from rest_framework.exceptions import ValidationError as DRFValidationError

    active_statuses = {
        AgentTaskStatus.ASSIGNED,
        AgentTaskStatus.RUNNING,
        AgentTaskStatus.WAITING_FOR_ANSWER,
    }

    # Check for active (non-cancellable) tasks first
    active_task = issue.agent_tasks.filter(status__in=active_statuses).first()
    if active_task:
        raise DRFValidationError(
            f"Cannot move issue back to BACKLOG: AgentTask {active_task.id} is currently "
            f"{active_task.status}. Wait for it to complete or cancel it first."
        )

    # Cancel all QUEUED tasks
    queued_tasks = issue.agent_tasks.filter(status=AgentTaskStatus.QUEUED)
    for task in queued_tasks:
        update_task_status(task, AgentTaskStatus.CANCELLED)


```

**Step 3: Run the new tests**

Run: `docker compose exec backend pytest tests/test_auto_agent_task.py::TestAgentTaskLifecycleOnStatusChange -v`

Expected: All 6 tests PASS.

**Step 4: Run full test suite**

Run: `docker compose exec backend pytest -v`

Expected: All tests pass.

**Step 5: Run lint**

Run: `docker compose exec backend ruff check .`

Expected: No errors. Fix any if found.

**Step 6: Commit**

```bash
git add backend/apps/projects/services/issue_service.py
git commit -m "fix: cancel QUEUED agent tasks on TODO→BACKLOG, block if active"
```
