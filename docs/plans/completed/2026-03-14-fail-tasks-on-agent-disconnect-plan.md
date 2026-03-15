# Fail Active Tasks on Agent Disconnect — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a ToonyAgent disconnects, automatically mark all its active tasks (ASSIGNED, RUNNING, WAITING_FOR_ANSWER) as FAILED with a descriptive error message.

**Architecture:** Add a `_fail_active_tasks` async DB helper and call it from `ToonyAgentRunnerConsumer.disconnect()` before setting the agent to OFFLINE. Broadcast each failed task to the frontend.

**Tech Stack:** Django Channels, async ORM via `database_sync_to_async`, pytest

---

### Task 1: Add `_fail_active_tasks` helper and update `disconnect()`

**Files:**
- Modify: `backend/apps/toony_agents/consumers.py:22-67` (async helpers section)
- Modify: `backend/apps/toony_agents/consumers.py:234-245` (`disconnect()` method)

**Step 1: Add `_fail_active_tasks` async helper**

Add this function after `_update_task_status` (after line 67), in the async helpers section:

```python
@database_sync_to_async
def _fail_active_tasks(agent_id):
    """Mark all active tasks for an agent as FAILED. Returns list of (task_id, previous_status)."""
    active_statuses = [
        AgentTaskStatus.ASSIGNED,
        AgentTaskStatus.RUNNING,
        AgentTaskStatus.WAITING_FOR_ANSWER,
    ]
    tasks = list(
        AgentTask.objects.filter(
            toony_agent_id=agent_id,
            status__in=active_statuses,
        ).values_list("id", "status")
    )
    for task_id, prev_status in tasks:
        AgentTask.objects.filter(id=task_id).update(
            status=AgentTaskStatus.FAILED,
            error=f"Agent disconnected (task was {prev_status})",
            completed_at=timezone.now(),
        )
    return tasks
```

**Step 2: Update `disconnect()` to call `_fail_active_tasks` and broadcast**

Replace the current `disconnect()` method (lines 234-245) with:

```python
async def disconnect(self, code):
    if hasattr(self, "agent_id"):
        # Fail active tasks before setting agent OFFLINE
        failed_tasks = await _fail_active_tasks(self.agent_id)
        for task_id, prev_status in failed_tasks:
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "task_status",
                    "data": {
                        "task_id": str(task_id),
                        "status": "FAILED",
                        "error": f"Agent disconnected (task was {prev_status})",
                    },
                },
            )

        await _set_agent_status(self.agent_id, ToonyAgentStatus.OFFLINE)
        await self.channel_layer.group_discard(
            self.runner_group,
            self.channel_name,
        )
        # Notify frontend
        await self.channel_layer.group_send(
            self.frontend_group,
            {"type": "agent_status", "data": {"status": "OFFLINE"}},
        )
```

**Step 3: Verify linting passes**

Run: `docker compose exec backend ruff check apps/toony_agents/consumers.py`
Expected: no errors

**Step 4: Commit**

```bash
git add backend/apps/toony_agents/consumers.py
git commit -m "feat(toony_agents): fail active tasks on agent disconnect"
```

---

### Task 2: Write tests for `_fail_active_tasks` behavior

**Files:**
- Modify: `backend/tests/test_toony_agents.py` (add new test class)

**Step 1: Write tests**

Add at the end of `test_toony_agents.py`:

```python
class TestFailActiveTasksOnDisconnect:
    """Test that active tasks are failed when agent disconnects."""

    def test_running_tasks_marked_failed(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(name="Bot", slug="disconnect-bot", registered_by=user)
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Running Task",
            prompt="Do it",
            status=AgentTaskStatus.RUNNING,
            created_by=user,
        )

        # Simulate what disconnect does: call the sync version of _fail_active_tasks
        from toony_agents.consumers import _fail_active_tasks
        failed = _fail_active_tasks.__wrapped__(agent.id)

        task.refresh_from_db()
        assert task.status == AgentTaskStatus.FAILED
        assert task.error == "Agent disconnected (task was RUNNING)"
        assert task.completed_at is not None
        assert len(failed) == 1

    def test_assigned_tasks_marked_failed(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(name="Bot", slug="disconnect-assigned-bot", registered_by=user)
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Assigned Task",
            prompt="Do it",
            status=AgentTaskStatus.ASSIGNED,
            created_by=user,
        )

        from toony_agents.consumers import _fail_active_tasks
        _fail_active_tasks.__wrapped__(agent.id)

        task.refresh_from_db()
        assert task.status == AgentTaskStatus.FAILED
        assert task.error == "Agent disconnected (task was ASSIGNED)"
        assert task.completed_at is not None

    def test_waiting_for_answer_tasks_marked_failed(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(name="Bot", slug="disconnect-waiting-bot", registered_by=user)
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Waiting Task",
            prompt="Do it",
            status=AgentTaskStatus.WAITING_FOR_ANSWER,
            created_by=user,
        )

        from toony_agents.consumers import _fail_active_tasks
        _fail_active_tasks.__wrapped__(agent.id)

        task.refresh_from_db()
        assert task.status == AgentTaskStatus.FAILED
        assert task.error == "Agent disconnected (task was WAITING_FOR_ANSWER)"

    def test_queued_tasks_not_affected(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(name="Bot", slug="disconnect-queued-bot", registered_by=user)
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Queued Task",
            prompt="Do it",
            status=AgentTaskStatus.QUEUED,
            created_by=user,
        )

        from toony_agents.consumers import _fail_active_tasks
        _fail_active_tasks.__wrapped__(agent.id)

        task.refresh_from_db()
        assert task.status == AgentTaskStatus.QUEUED

    def test_completed_tasks_not_affected(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(name="Bot", slug="disconnect-completed-bot", registered_by=user)
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Done Task",
            prompt="Do it",
            status=AgentTaskStatus.COMPLETED,
            created_by=user,
        )

        from toony_agents.consumers import _fail_active_tasks
        _fail_active_tasks.__wrapped__(agent.id)

        task.refresh_from_db()
        assert task.status == AgentTaskStatus.COMPLETED

    def test_multiple_active_tasks_all_failed(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent = ToonyAgent.objects.create(name="Bot", slug="disconnect-multi-bot", registered_by=user)
        t1 = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Task 1",
            prompt="Do it",
            status=AgentTaskStatus.RUNNING,
            created_by=user,
        )
        t2 = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Task 2",
            prompt="Do it",
            status=AgentTaskStatus.ASSIGNED,
            created_by=user,
        )
        t3 = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent,
            title="Task 3",
            prompt="Do it",
            status=AgentTaskStatus.QUEUED,
            created_by=user,
        )

        from toony_agents.consumers import _fail_active_tasks
        failed = _fail_active_tasks.__wrapped__(agent.id)

        assert len(failed) == 2
        t1.refresh_from_db()
        t2.refresh_from_db()
        t3.refresh_from_db()
        assert t1.status == AgentTaskStatus.FAILED
        assert t2.status == AgentTaskStatus.FAILED
        assert t3.status == AgentTaskStatus.QUEUED  # untouched

    def test_other_agent_tasks_not_affected(self, user, organization):
        from toony_agents.models import AgentTask, AgentTaskStatus, ToonyAgent

        agent1 = ToonyAgent.objects.create(name="Bot 1", slug="disconnect-other-bot-1", registered_by=user)
        agent2 = ToonyAgent.objects.create(name="Bot 2", slug="disconnect-other-bot-2", registered_by=user)
        task1 = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent1,
            title="Agent1 Task",
            prompt="Do it",
            status=AgentTaskStatus.RUNNING,
            created_by=user,
        )
        task2 = AgentTask.objects.create(
            organization=organization,
            toony_agent=agent2,
            title="Agent2 Task",
            prompt="Do it",
            status=AgentTaskStatus.RUNNING,
            created_by=user,
        )

        from toony_agents.consumers import _fail_active_tasks
        _fail_active_tasks.__wrapped__(agent1.id)

        task1.refresh_from_db()
        task2.refresh_from_db()
        assert task1.status == AgentTaskStatus.FAILED
        assert task2.status == AgentTaskStatus.RUNNING  # untouched
```

**Step 2: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestFailActiveTasksOnDisconnect -v`
Expected: all 7 tests PASS

**Step 3: Run full test suite to verify no regressions**

Run: `docker compose exec backend pytest tests/test_toony_agents.py -v`
Expected: all tests PASS

**Step 4: Commit**

```bash
git add backend/tests/test_toony_agents.py
git commit -m "test(toony_agents): add tests for failing tasks on agent disconnect"
```
