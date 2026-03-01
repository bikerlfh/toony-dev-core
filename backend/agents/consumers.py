from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from accounts.models import OrganizationMembership
from agents.models import Agent


@database_sync_to_async
def _get_agent_org_id(agent_id):
    try:
        return str(
            Agent.objects.values_list("organization_id", flat=True).get(id=agent_id)
        )
    except Agent.DoesNotExist:
        return None


@database_sync_to_async
def _is_org_member(user, org_id):
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id=org_id,
        is_active=True,
    ).exists()


@database_sync_to_async
def _update_agent_status(agent_id, status):
    Agent.objects.filter(id=agent_id).update(status=status)


class AgentConsumer(AsyncJsonWebsocketConsumer):
    """
    Bidirectional WebSocket for agent task assignment, results,
    status updates, and heartbeat.
    """

    async def connect(self):
        self.agent_id = self.scope["url_route"]["kwargs"]["agent_id"]
        self.group_name = f"agent_{self.agent_id}"
        user = self.scope.get("user")

        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        org_id = await _get_agent_org_id(self.agent_id)
        if org_id is None or not await _is_org_member(user, org_id):
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "task.result":
            # Placeholder for task result processing
            pass
        elif msg_type == "status.update":
            status = content.get("status")
            if status:
                await _update_agent_status(self.agent_id, status)
        elif msg_type == "heartbeat":
            await self.send_json({"type": "heartbeat.ack"})

    # --- Group handler ---

    async def task_assign(self, event):
        await self.send_json({"type": "task.assign", "data": event["data"]})
