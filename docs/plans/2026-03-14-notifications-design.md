# Notification System Design

## Overview

In-app notification system for Toony Dev Core. Real-time delivery via WebSocket, persisted in DB, with a dropdown in the sidebar and a full `/notifications` page. Designed for extensibility — adding new event types requires no migrations or model changes, and new delivery channels (email) can be plugged in without modifying handlers.

## Architecture

**Approach: Event-driven with handler registry.**

```
Service → NotificationService.notify(event_type, context)
              → Registry lookup → Handler(context) → list[NotificationData]
              → bulk_create in DB
              → Dispatch to channels (InAppChannel → WebSocket broadcast)
```

Services call `NotificationService.notify()` with one line. All targeting logic ("who gets notified") and content generation ("what the notification says") lives in handlers. Channels handle delivery.

## Data Model

New Django app: `notifications`.

### Notification

Extends `BaseModel` (UUID pk, created_at, updated_at).

| Field | Type | Notes |
|---|---|---|
| `recipient` | FK(User) | Who receives the notification |
| `organization` | FK(Organization) | For filtering by org |
| `event_type` | CharField(100) | e.g. `issue.assigned`, `comment.created` |
| `actor` | FK(User, null) | Who triggered it. Null for system events |
| `title` | CharField(255) | Pre-rendered, e.g. "Te asignaron ENG-42: Fix login" |
| `body` | TextField(blank) | Optional detail |
| `target_type` | CharField(50) | `issue`, `comment`, `project`, `agent_task`, `artifact` |
| `target_id` | UUIDField | ID of the related object |
| `metadata` | JSONField | Extra routing data: `project_id`, `issue_identifier`, etc. |
| `is_read` | BooleanField | Default False |
| `read_at` | DateTimeField(null) | When marked as read |

**Index:** `(recipient, is_read, created_at)` for the main query.

**Design decisions:**
- `event_type` as free string (not choices) — registry defines valid types, no migration per new type.
- `target_type` + `target_id` instead of GenericForeignKey — simpler, no ContentType overhead.
- `title`/`body` pre-rendered by handlers — no rendering logic in frontend.
- `metadata` as JSONField — frontend uses it for URL construction without extra queries.

## Backend

### Registry

```python
# notifications/registry.py
_registry: dict[str, NotificationHandler] = {}

def register(event_type: str):
    def decorator(func):
        _registry[event_type] = func
        return func
    return decorator

def get_handler(event_type: str) -> NotificationHandler | None:
    return _registry.get(event_type)
```

### Handlers

One file per domain, auto-registered via decorator:

```
notifications/
  handlers/
    __init__.py       # imports all modules for auto-registration
    issues.py         # issue.assigned, issue.status_changed
    comments.py       # comment.created, comment.mentioned
    projects.py       # project.member_added, project.member_removed
    agents.py         # agent_task.completed, agent_task.failed
    artifacts.py      # artifact.created
```

Example handler:

```python
@register("issue.assigned")
def handle_issue_assigned(context: EventContext) -> list[NotificationData]:
    issue = context["issue"]
    actor = context["actor"]
    assignee = context["assignee"]

    if assignee == actor:
        return []

    return [NotificationData(
        recipient=assignee,
        organization=issue.project.organization,
        event_type="issue.assigned",
        actor=actor,
        title=f"Te asignaron {issue.identifier}: {issue.title}",
        target_type="issue",
        target_id=issue.id,
        metadata={"project_id": str(issue.project.id), "issue_identifier": issue.identifier},
    )]
```

### NotificationService

```python
class NotificationService:
    @staticmethod
    def notify(event_type: str, context: dict) -> None:
        handler = get_handler(event_type)
        if handler is None:
            logger.warning(f"No handler for event: {event_type}")
            return

        notifications_data = handler(context)

        notifications = Notification.objects.bulk_create([
            Notification(**data.to_dict()) for data in notifications_data
        ])

        for channel in _channels:
            channel.send(notifications)
```

### Channels

```python
class InAppChannel:
    def send(self, notifications: list[Notification]) -> None:
        for notification in notifications:
            broadcast(
                group_name=f"user_{notification.recipient.id}",
                event_type="notification.created",
                data=NotificationOutputSerializer(notification).data,
            )
```

Adding email later = create `EmailChannel`, register it in `_channels`.

### Integration with existing services

One line per event in existing services:

```python
# In issue_service.py update_issue()
if "assignee" in changed_fields:
    NotificationService.notify("issue.assigned", {
        "issue": issue, "actor": request.user, "assignee": issue.assignee,
    })
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications/` | List notifications (paginated, filters: `is_read`, `organization`) |
| POST | `/api/notifications/mark-read/` | Mark specific notifications as read (`{ids: [...]}`) |
| POST | `/api/notifications/mark-all-read/` | Mark all as read (optional org filter) |
| GET | `/api/notifications/unread-count/` | Unread count for badge |

### WebSocket

New `NotificationConsumer` on group `user_{user_id}`. User connects on auth, receives `notification.created` events in real-time, independent of project-scoped WebSocket.

## Frontend

### NotificationProvider

Global context at root layout level, inside AuthProvider:

```
AuthProvider
  └── NotificationProvider
        └── children
```

- Opens WebSocket to `ws/notifications/?token=` on auth
- Maintains state: `unreadCount`, `notifications` (latest N for dropdown)
- Exposes: `markAsRead()`, `markAllAsRead()`, `fetchMore()`
- Hook: `useNotifications()`

### Sidebar — Bell icon

In the sidebar, bell icon with badge showing `unreadCount` (hidden when 0).

Click opens a **dropdown**:
- Header: "Notificaciones" + "Marcar todas como leídas" button
- List of latest ~15 notifications
- Each item: actor avatar, title, relative time, blue dot for unread
- Click → navigate to target + mark as read
- Footer: "Ver todas" link → `/notifications`

### `/notifications` page

Full page with:
- Top filters: organization (dropdown), status (All / Unread)
- Paginated list with same item component as dropdown but more spacious
- Bulk actions: select + mark as read

### URL construction

```typescript
function getNotificationUrl(notification: Notification): string {
  switch (notification.target_type) {
    case "issue":
      return `/projects/${notification.metadata.project_id}/issues/${notification.target_id}`;
    case "project":
      return `/projects/${notification.target_id}`;
    case "agent_task":
      return `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`;
    case "artifact":
      return `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`;
    default:
      return "/notifications";
  }
}
```

### Real-time toast

When a WebSocket notification arrives while user is active, show a temporary toast (3-4 seconds) in the bottom-right corner. Click navigates to target. Lightweight custom component, no external dependency.

## Events & Targeting Rules

### Event table

| Event | Recipients | Title example |
|---|---|---|
| `issue.assigned` | Assignee | "Te asignaron ENG-42: Fix login bug" |
| `issue.status_changed` | Assignee + reporter | "ENG-42 pasó a IN_REVIEW" |
| `comment.created` | Assignee + reporter + previous commenters | "Luis comentó en ENG-42" |
| `comment.mentioned` | Users mentioned with @email | "Te mencionaron en un comentario en ENG-42" |
| `project.member_added` | Added member | "Te agregaron al proyecto Backend API" |
| `project.member_removed` | Removed member | "Te removieron del proyecto Backend API" |
| `agent_task.completed` | Task creator | "Tarea completada: Implementar endpoint" |
| `agent_task.failed` | Task creator | "Tarea fallida: Implementar endpoint" |
| `artifact.created` | Assignee + reporter of associated issue | "Nuevo artefacto en ENG-42: migration.sql" |

### Cross-cutting rules

- **Never self-notify** — all handlers filter `recipient != actor`
- **No duplicates** — if a user qualifies for multiple reasons (assignee AND reporter), they get one notification
- **Issue participants** = assignee + reporter + anyone who has commented (for `comment.created`)
- **Mentions** — parse comment body for `@email` to resolve users

### Adding a new event type

3 steps, no migrations:
1. Create handler in `notifications/handlers/<domain>.py` with `@register("new.event")`
2. Add `NotificationService.notify(...)` call in the corresponding service
3. Add case in `getNotificationUrl()` if it's a new `target_type`

## Future extensibility

- **Email channel**: Create `EmailChannel`, register in `_channels`. Handlers already produce all needed data.
- **User preferences**: Add `NotificationPreference` model with `(user, event_type, channel, enabled)`. Check in `NotificationService.notify()` before creating.
- **Webhooks**: Another channel implementation.
- **New event types**: Just a handler + one service call. No schema changes.
