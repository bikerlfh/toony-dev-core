# Fail Active Tasks on Agent Disconnect

**Date:** 2026-03-14
**Status:** Approved

## Problem

When a ToonyAgent disconnects (WebSocket closes), any AgentTask in active states (ASSIGNED, RUNNING, WAITING_FOR_ANSWER) remains stuck in that state indefinitely. These tasks can never progress without the agent, so they should be marked as FAILED.

## Solution

Add cleanup logic in `ToonyAgentRunnerConsumer.disconnect()` to fail all active tasks before setting the agent to OFFLINE.

### Approach: Fail tasks in `disconnect()` handler

**File:** `backend/apps/toony_agents/consumers.py`

**New async helper — `_fail_active_tasks(agent_id)`:**
- Query: `AgentTask.objects.filter(toony_agent_id=agent_id, status__in=[ASSIGNED, RUNNING, WAITING_FOR_ANSWER])`
- For each task: save previous status, update to `status=FAILED`, set `error="Agent disconnected (task was {previous_status})"`, set `completed_at=now()`
- Return list of affected tasks for broadcasting

**Modified `disconnect()` method:**
1. Call `_fail_active_tasks(agent_id)` — fail active tasks first
2. Broadcast task status updates to frontend for each affected task
3. Set agent status to OFFLINE (existing logic)
4. Broadcast agent OFFLINE status (existing logic)

### Flow

```
Agent WebSocket closes
  -> disconnect()
  -> _fail_active_tasks(agent_id)
    -> Find tasks in ASSIGNED/RUNNING/WAITING_FOR_ANSWER
    -> Mark each FAILED with descriptive error and completed_at
    -> Broadcast to frontend per task
  -> _set_agent_status(OFFLINE)
  -> Broadcast agent status OFFLINE
```

### Design Decisions

- **Order:** Fail tasks before setting agent OFFLINE so frontend receives task updates first
- **No atomicity needed:** Each task update is independent, consistent with existing patterns
- **Lives in consumer:** Uses existing async helper pattern (`_update_task_status`, `_set_agent_status`), not in `agent_task_service.py`
- **Error message includes previous status:** e.g., `"Agent disconnected (task was RUNNING)"`

### States Affected

| Previous Status | New Status | Error Message |
|---|---|---|
| ASSIGNED | FAILED | Agent disconnected (task was ASSIGNED) |
| RUNNING | FAILED | Agent disconnected (task was RUNNING) |
| WAITING_FOR_ANSWER | FAILED | Agent disconnected (task was WAITING_FOR_ANSWER) |
