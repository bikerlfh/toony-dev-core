# Runner Config Update from Frontend

## Goal

Allow editing `max_concurrent_tasks` and `max_task_timeout` from the agent detail page, sending changes to the runner via WebSocket, applying them in memory, and persisting to `config.yml`.

## Flow

```
Frontend (modal) -> WS "config.update" -> Backend ToonyAgentConsumer (relay)
-> channel_layer group_send -> Backend ToonyAgentRunnerConsumer (handler)
-> WS "config.update" -> Runner main.py
-> Update memory + persist config.yml
-> Send "config.update.ack" -> Backend -> Frontend (confirm success/error)
-> Runner re-sends register with updated metadata -> Frontend updates header
```

## Frontend Changes

- **Button**: "Runner Settings" in header, next to "Sync Config" and "Manage Keys", visible only when `agent.status !== "OFFLINE"`
- **Modal**: Two fields — "Max Concurrent Tasks" (number, min 1 max 100) and "Task Timeout" (number in minutes, min 1 max 480)
- **Initial values**: Read from `agent.metadata.max_concurrent_tasks` and `agent.metadata.max_task_timeout` (converted from seconds to minutes)
- **Save flow**: Sends `config.update` via WebSocket, button shows "Saving..."
- **Ack handling**: On `config.update.ack` — close modal if success, show inline error if failure
- **Hook**: New `sendConfigUpdate(config)` helper in `useToonyAgentWebSocket`

## Backend Changes

- `ToonyAgentConsumer.receive_json`: New case `config.update` — relay to runner via `channel_layer.group_send` to runner group
- `ToonyAgentRunnerConsumer`: New group handler `config_update` — sends `config.update` message to runner WebSocket
- `ToonyAgentRunnerConsumer.receive_json`: New case `config.update.ack` — broadcast to frontend group as `config.update.status`

## Runner Changes

- `protocol.py`: New `ConfigUpdate` dataclass (incoming) with `max_concurrent_tasks` and `max_task_timeout` fields. New `ConfigUpdateAckMessage` (outgoing) with `success` and optional `error`.
- `main.py`: Handler for `ConfigUpdate` — validates values, updates `max_tasks` variable in memory, updates `config.claude.max_task_timeout`, calls `save_config()`, re-sends `RegisterMessage` with updated metadata.
- `config.py`: New `save_config(path, config)` function that writes updated YAML to disk.

## Validation

- Frontend: Basic range validation on form inputs before send
- Runner: Validates ranges before applying (rejects out-of-range values, sends ack with error)

## Constraints

- Button disabled when agent is OFFLINE (no pending config mechanism)
- Timeout displayed/edited in minutes in the UI, stored/transmitted in seconds
