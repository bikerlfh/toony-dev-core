# Fix: AgentTask lifecycle on Issue status changes

## Overview

Fix duplicate AgentTask creation when an issue is moved TODO→BACKLOG→TODO. Handle AgentTask cancellation and status transition blocking.

## Rules

| Transition | AgentTask QUEUED | AgentTask ASSIGNED/RUNNING/WAITING_FOR_ANSWER | No active AgentTask |
|---|---|---|---|
| TODO→BACKLOG | Pause task automatically (QUEUED→PAUSED), allow transition | Block transition (ValidationError with message) | Allow transition |
| TODO→IN_PROGRESS | No effect | No effect | No effect |
| BACKLOG→TODO | N/A (task would be PAUSED) | N/A | Create new AgentTask |
| BACKLOG→TODO (PAUSED task exists) | Reactivate paused task (PAUSED→QUEUED, regenerate prompt) | N/A | N/A |

## TODO→BACKLOG logic

In `update_issue`, when status changes from TODO to BACKLOG:

1. Query `issue.agent_tasks` for tasks with status in (ASSIGNED, RUNNING, WAITING_FOR_ANSWER)
2. If any found → raise `ValidationError` with message: `"Cannot move issue back to BACKLOG: AgentTask {task_id} is currently {status}. Wait for it to complete or cancel it first."`
3. Query `issue.agent_tasks` for tasks with status QUEUED
4. Pause each one via `update_task_status(task, PAUSED)`
5. Proceed with status change

## Location

All logic in `update_issue` in `backend/apps/projects/services/issue_service.py`, inline before the transaction block — same pattern as the existing BACKLOG→TODO trigger.
