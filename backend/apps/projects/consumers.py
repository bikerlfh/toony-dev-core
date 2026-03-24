from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from accounts.models import OrganizationMembership
from projects.models import Project


@database_sync_to_async
def _get_project_org_id(project_id):
    try:
        return str(Project.objects.values_list("organization_id", flat=True).get(id=project_id))
    except Project.DoesNotExist:
        return None


@database_sync_to_async
def _is_org_member(user, org_id):
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id=org_id,
        is_active=True,
    ).exists()


class ProjectConsumer(AsyncJsonWebsocketConsumer):
    """
    Server-push WebSocket for real-time issue and comment events
    on a specific project.
    """

    async def connect(self):
        self.project_id = self.scope["url_route"]["kwargs"]["project_id"]
        self.group_name = f"project_{self.project_id}"
        user = self.scope.get("user")

        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        org_id = await _get_project_org_id(self.project_id)
        if org_id is None or not await _is_org_member(user, org_id):
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Server-push only — ignore client messages
        pass

    # --- Group handlers ---

    async def issue_created(self, event):
        await self.send_json({"type": "issue.created", "data": event["data"]})

    async def issue_updated(self, event):
        await self.send_json({"type": "issue.updated", "data": event["data"]})

    async def issue_deleted(self, event):
        await self.send_json({"type": "issue.deleted", "data": event["data"]})

    async def comment_created(self, event):
        await self.send_json({"type": "comment.created", "data": event["data"]})

    async def comment_updated(self, event):
        await self.send_json({"type": "comment.updated", "data": event["data"]})

    async def comment_deleted(self, event):
        await self.send_json({"type": "comment.deleted", "data": event["data"]})


@database_sync_to_async
def _get_user_project_ids(user):
    """Return project IDs for all projects where user is a member."""
    from projects.models import ProjectMembership

    return list(
        ProjectMembership.objects.filter(user=user).values_list("project_id", flat=True)
    )


class UserIssuesConsumer(AsyncJsonWebsocketConsumer):
    """
    User-scoped WebSocket that aggregates issue events
    across all projects the user belongs to.
    Route: ws/issues/?token=<jwt>
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.project_ids = await _get_user_project_ids(user)
        self.group_names = [f"project_{pid}" for pid in self.project_ids]

        for group in self.group_names:
            await self.channel_layer.group_add(group, self.channel_name)

        await self.accept()

    async def disconnect(self, code):
        for group in getattr(self, "group_names", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        pass

    # --- Forward issue events ---

    async def issue_created(self, event):
        await self.send_json({"type": "issue.created", "data": event["data"]})

    async def issue_updated(self, event):
        await self.send_json({"type": "issue.updated", "data": event["data"]})

    async def issue_deleted(self, event):
        await self.send_json({"type": "issue.deleted", "data": event["data"]})

    # --- Ignore comment events ---

    async def comment_created(self, event):
        pass

    async def comment_updated(self, event):
        pass

    async def comment_deleted(self, event):
        pass
