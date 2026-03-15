from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from accounts.models import OrganizationMembership
from toony_agents.models import (
    AgentTask,
    AgentTaskStatus,
    TaskEvent,
    TaskEventType,
    ToonyAgent,
    ToonyAgentStatus,
)
from toony_agents.selectors.workspace_config_selector import (
    get_agent_workspace_config as _sync_get_workspace_config,
)
from toony_agents.services.toony_agent_service import (
    verify_api_key as _sync_verify_api_key,
)

# -- Async DB helpers ----------------------------------------------------------


@database_sync_to_async
def _verify_api_key(raw_key):
    return _sync_verify_api_key(raw_key)


@database_sync_to_async
def _get_workspace_config(agent_id):
    return _sync_get_workspace_config(agent_id)


@database_sync_to_async
def _set_agent_status(agent_id, agent_status, **kwargs):
    updates = {}
    if agent_status is not None:
        updates["status"] = agent_status
    if kwargs.get("last_connected_at"):
        updates["last_connected_at"] = timezone.now()
    if kwargs.get("last_heartbeat"):
        updates["last_heartbeat"] = timezone.now()
    if kwargs.get("metadata"):
        updates["metadata"] = kwargs["metadata"]
    ToonyAgent.objects.filter(id=agent_id).update(**updates)


@database_sync_to_async
def _update_task_status(task_id, new_status, **kwargs):
    updates = {"status": new_status}
    if new_status in (
        AgentTaskStatus.COMPLETED,
        AgentTaskStatus.FAILED,
        AgentTaskStatus.CANCELLED,
    ):
        updates["completed_at"] = timezone.now()
    if "result" in kwargs:
        updates["result"] = kwargs["result"]
    if "error" in kwargs:
        updates["error"] = kwargs["error"]
    if kwargs.get("toony_agent_id"):
        AgentTask.objects.filter(
            id=task_id,
            toony_agent_id=kwargs["toony_agent_id"],
        ).update(**updates)
    else:
        AgentTask.objects.filter(id=task_id).update(**updates)

    # Send notifications for terminal statuses
    if new_status in (AgentTaskStatus.COMPLETED, AgentTaskStatus.FAILED):
        from notifications.services import notify

        task = AgentTask.objects.select_related("created_by", "organization").get(id=task_id)
        event = "agent_task.completed" if new_status == AgentTaskStatus.COMPLETED else "agent_task.failed"
        notify(event, {"task": task})


@database_sync_to_async
def _fail_active_tasks(agent_id):
    """Mark all active tasks for an agent as FAILED. Returns list of (task_id, previous_status)."""
    from notifications.services import notify

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
        task = AgentTask.objects.select_related("created_by", "organization").get(id=task_id)
        notify("agent_task.failed", {"task": task})
    return tasks


@database_sync_to_async
def _mark_task_running_if_assigned(task_id):
    """Atomically transition task from ASSIGNED to RUNNING. Returns True if transitioned."""
    rows = AgentTask.objects.filter(
        id=task_id,
        status=AgentTaskStatus.ASSIGNED,
    ).update(status=AgentTaskStatus.RUNNING, started_at=timezone.now())
    return rows > 0


@database_sync_to_async
def _create_task_event(task_id, event_type, data, sequence):
    return TaskEvent.objects.create(
        task_id=task_id,
        event_type=event_type,
        data=data,
        sequence=sequence,
    )


@database_sync_to_async
def _create_system_event(agent_id, event_type, organization_id, project_id, data):
    from toony_agents.models import AgentSystemEvent
    return AgentSystemEvent.objects.create(
        toony_agent_id=agent_id,
        event_type=event_type,
        organization_id=organization_id,
        project_id=project_id,
        data=data,
    )


@database_sync_to_async
def _get_queued_tasks(agent_id):
    return list(
        AgentTask.objects.filter(
            toony_agent_id=agent_id,
            status=AgentTaskStatus.QUEUED,
        ).values("id", "title", "prompt", "project_id")
    )


@database_sync_to_async
def _is_org_member(user, agent_id):
    org_ids = list(
        ToonyAgent.objects.filter(id=agent_id).values_list(
            "organizations__id",
            flat=True,
        )
    )
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id__in=org_ids,
        is_active=True,
    ).exists()


@database_sync_to_async
def _validate_task_ownership(task_id, agent_id):
    """Check that a task belongs to the given agent."""
    return AgentTask.objects.filter(
        id=task_id,
        toony_agent_id=agent_id,
    ).exists()


@database_sync_to_async
def _validate_task_org_member(task_id, user):
    """Check that a task belongs to an org the user is a member of."""
    org_ids = list(
        AgentTask.objects.filter(id=task_id).values_list(
            "organization_id",
            flat=True,
        )
    )
    if not org_ids:
        return False
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id__in=org_ids,
        is_active=True,
    ).exists()


@database_sync_to_async
def _update_task_session_id(task_id, session_id):
    AgentTask.objects.filter(id=task_id).update(session_id=session_id)


@database_sync_to_async
def _get_task_session_info(task_id):
    try:
        return AgentTask.objects.values("session_id", "toony_agent_id").get(id=task_id)
    except AgentTask.DoesNotExist:
        return None


@database_sync_to_async
def _get_max_event_sequence(task_id):
    from django.db.models import Max

    result = TaskEvent.objects.filter(task_id=task_id).aggregate(Max("sequence"))
    return result["sequence__max"] or 0


@database_sync_to_async
def _create_task_question(task_id, question_id, text, session_id):
    from toony_agents.models import AgentTaskQuestion

    return AgentTaskQuestion.objects.create(
        task_id=task_id,
        question_id=question_id,
        text=text,
        session_id=session_id,
    )


@database_sync_to_async
def _answer_task_question(question_id, answer):
    from toony_agents.models import AgentTaskQuestion

    return AgentTaskQuestion.objects.filter(
        question_id=question_id,
    ).update(answer=answer, answered_at=timezone.now())


@database_sync_to_async
def _get_question_session_id(question_id):
    from toony_agents.models import AgentTaskQuestion

    try:
        return AgentTaskQuestion.objects.values_list(
            "session_id", flat=True,
        ).get(question_id=question_id)
    except AgentTaskQuestion.DoesNotExist:
        return ""


_VALID_EVENT_TYPES = {e.value for e in TaskEventType}


# -- Runner-facing consumer ----------------------------------------------------


class ToonyAgentRunnerConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket for the toony_agent_runner daemon. Auth via API key."""

    async def connect(self):
        query_string = self.scope.get("query_string", b"").decode()
        params = dict(p.split("=", 1) for p in query_string.split("&") if "=" in p)
        raw_key = params.get("key", "")

        self.toony_agent = await _verify_api_key(raw_key)
        if self.toony_agent is None:
            await self.close(code=4001)
            return

        self.agent_id = str(self.toony_agent.id)
        self.runner_group = f"toony_agent_runner_{self.agent_id}"
        self.frontend_group = f"toony_agent_{self.agent_id}"

        await self.channel_layer.group_add(self.runner_group, self.channel_name)
        await self.accept()

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

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "register":
            metadata = content.get("metadata", {})
            await _set_agent_status(
                self.agent_id,
                ToonyAgentStatus.ONLINE,
                last_connected_at=True,
                metadata=metadata,
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "agent_status",
                    "data": {"status": "ONLINE", "metadata": metadata},
                },
            )
            # Send workspace config sync.
            workspace_config = await _get_workspace_config(self.agent_id)
            await self.send_json(
                {
                    "type": "config.sync",
                    "organizations": workspace_config,
                }
            )
            # Send any queued tasks
            queued = await _get_queued_tasks(self.agent_id)
            for task in queued:
                msg = {
                    "type": "task.assign",
                    "task_id": str(task["id"]),
                    "prompt": task["prompt"],
                    "title": task["title"],
                }
                if task.get("project_id"):
                    msg["project_id"] = str(task["project_id"])
                await self.send_json(msg)

        elif msg_type == "heartbeat":
            await _set_agent_status(self.agent_id, None, last_heartbeat=True)
            await self.send_json({"type": "heartbeat.ack"})

        elif msg_type == "task.accepted":
            task_id = content.get("task_id")
            if not task_id:
                await self.send_json({"type": "error", "message": "task_id is required"})
                return
            if not await _validate_task_ownership(task_id, self.agent_id):
                await self.send_json({"type": "error", "message": "Task not found for this agent"})
                return
            await _update_task_status(
                task_id,
                AgentTaskStatus.ASSIGNED,
                toony_agent_id=self.agent_id,
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "task_status",
                    "data": {"task_id": task_id, "status": "ASSIGNED"},
                },
            )

        elif msg_type == "task.event":
            task_id = content.get("task_id")
            if not task_id:
                await self.send_json({"type": "error", "message": "task_id is required"})
                return
            if not await _validate_task_ownership(task_id, self.agent_id):
                await self.send_json({"type": "error", "message": "Task not found for this agent"})
                return
            event_type = content.get("event_type", TaskEventType.LOG)
            if event_type not in _VALID_EVENT_TYPES:
                await self.send_json({"type": "error", "message": f"Invalid event_type: {event_type}"})
                return
            data = content.get("data", {})
            sequence = content.get("sequence", 0)
            await _create_task_event(task_id, event_type, data, sequence)
            # Atomically transition ASSIGNED -> RUNNING (only happens once)
            transitioned = await _mark_task_running_if_assigned(task_id)
            if transitioned:
                await _set_agent_status(self.agent_id, ToonyAgentStatus.BUSY)
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "task_event",
                    "data": {
                        "task_id": task_id,
                        "event_type": event_type,
                        "data": data,
                        "sequence": sequence,
                    },
                },
            )

        elif msg_type == "question.asked":
            task_id = content.get("task_id")
            if not task_id:
                await self.send_json({"type": "error", "message": "task_id is required"})
                return
            if not await _validate_task_ownership(task_id, self.agent_id):
                await self.send_json({"type": "error", "message": "Task not found for this agent"})
                return
            question_id = content.get("question_id", "")
            question = content.get("question", {})
            session_id = content.get("session_id", "")
            question_text = question.get("text", "") if isinstance(question, dict) else str(question)
            sequence = content.get("sequence", 0)

            await _update_task_status(
                task_id,
                AgentTaskStatus.WAITING_FOR_ANSWER,
                toony_agent_id=self.agent_id,
            )
            await _create_task_question(
                task_id,
                question_id,
                question_text,
                session_id,
            )
            await _create_task_event(
                task_id,
                TaskEventType.QUESTION_ASKED,
                {"question_id": question_id, "text": question_text},
                sequence,
            )
            # Forward structured question data to frontend.
            frontend_question_data = {"task_id": task_id, "question_id": question_id, "sequence": sequence}
            if isinstance(question, dict):
                frontend_question_data["question"] = question
            else:
                frontend_question_data["question"] = {"text": question_text, "type": "free_text"}
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "task_status",
                    "data": {"task_id": task_id, "status": "WAITING_FOR_ANSWER"},
                },
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "question_asked",
                    "data": frontend_question_data,
                },
            )

        elif msg_type == "task.completed":
            task_id = content.get("task_id")
            if not task_id:
                await self.send_json({"type": "error", "message": "task_id is required"})
                return
            if not await _validate_task_ownership(task_id, self.agent_id):
                await self.send_json({"type": "error", "message": "Task not found for this agent"})
                return
            result = content.get("result", "")
            session_id = content.get("session_id")
            await _update_task_status(
                task_id,
                AgentTaskStatus.COMPLETED,
                result=result,
                toony_agent_id=self.agent_id,
            )
            if session_id:
                await _update_task_session_id(task_id, session_id)
            await _set_agent_status(self.agent_id, ToonyAgentStatus.ONLINE)
            status_data = {"task_id": task_id, "status": "COMPLETED"}
            if session_id:
                status_data["session_id"] = session_id
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "task_status", "data": status_data},
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "agent_status", "data": {"status": "ONLINE"}},
            )

        elif msg_type == "task.failed":
            task_id = content.get("task_id")
            if not task_id:
                await self.send_json({"type": "error", "message": "task_id is required"})
                return
            if not await _validate_task_ownership(task_id, self.agent_id):
                await self.send_json({"type": "error", "message": "Task not found for this agent"})
                return
            error = content.get("error", "")
            await _update_task_status(
                task_id,
                AgentTaskStatus.FAILED,
                error=error,
                toony_agent_id=self.agent_id,
            )
            await _set_agent_status(self.agent_id, ToonyAgentStatus.ONLINE)
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "task_status",
                    "data": {
                        "task_id": task_id,
                        "status": "FAILED",
                        "error": error,
                    },
                },
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "agent_status", "data": {"status": "ONLINE"}},
            )

        elif msg_type == "config.sync.ack":
            success = content.get("success", False)
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "config_sync_status",
                    "data": {
                        "success": success,
                        "org_count": content.get("org_count", 0),
                        "project_count": content.get("project_count", 0),
                        "error": content.get("error", ""),
                    },
                },
            )

        elif msg_type == "config.update.ack":
            success = content.get("success", False)
            metadata = content.get("metadata", {})
            if success and metadata:
                await _set_agent_status(self.agent_id, None, metadata=metadata)
            await self.channel_layer.group_send(
                self.frontend_group,
                {
                    "type": "config_update_status",
                    "data": {
                        "success": success,
                        "metadata": metadata,
                        "error": content.get("error", ""),
                    },
                },
            )

        elif msg_type == "repo.clone.result":
            clone_status = content.get("status")
            project_id = content.get("project_id")
            organization_id = content.get("organization_id")
            repository_url = content.get("repository_url", "")

            from toony_agents.models import AgentSystemEventType
            event_type = (
                AgentSystemEventType.REPO_CLONE_SUCCESS
                if clone_status == "success"
                else AgentSystemEventType.REPO_CLONE_ERROR
            )
            event_data = {"repository_url": repository_url}
            if clone_status == "success":
                event_data["branch"] = content.get("branch", "")
                event_data["clone_duration_ms"] = content.get("clone_duration_ms", 0)
            else:
                event_data["error"] = content.get("error", "")

            await _create_system_event(
                self.agent_id, event_type, organization_id, project_id, event_data,
            )
            await self.channel_layer.group_send(
                self.frontend_group,
                {"type": "repo_clone_result", "data": content},
            )

        else:
            await self.send_json({"type": "error", "message": f"Unknown message type: {msg_type}"})

    # Group handlers (receive from frontend consumer via channel layer)

    async def question_answered(self, event):
        await self.send_json(
            {
                "type": "question.answered",
                "task_id": event["data"]["task_id"],
                "question_id": event["data"]["question_id"],
                "answer": event["data"]["answer"],
                "session_id": event["data"].get("session_id", ""),
                "sequence_offset": event["data"].get("sequence_offset", 0),
            }
        )

    async def task_cancel(self, event):
        await self.send_json(
            {
                "type": "task.cancel",
                "task_id": event["data"]["task_id"],
            }
        )

    async def task_assign(self, event):
        msg = {
            "type": "task.assign",
            "task_id": event["data"]["task_id"],
            "prompt": event["data"]["prompt"],
            "title": event["data"]["title"],
        }
        if event["data"].get("project_id"):
            msg["project_id"] = event["data"]["project_id"]
        await self.send_json(msg)

    async def task_reply(self, event):
        await self.send_json(
            {
                "type": "task.reply",
                "task_id": event["data"]["task_id"],
                "message": event["data"]["message"],
                "session_id": event["data"]["session_id"],
                "sequence_offset": event["data"].get("sequence_offset", 0),
            }
        )

    async def config_sync_request(self, event):
        """Frontend requested config sync — query fresh data and send to runner."""
        workspace_config = await _get_workspace_config(self.agent_id)
        await self.send_json(
            {
                "type": "config.sync",
                "organizations": workspace_config,
            }
        )

    async def config_update(self, event):
        """Frontend requested config update — relay to runner."""
        msg = {"type": "config.update"}
        msg.update(event["data"])
        await self.send_json(msg)


# -- Frontend-facing consumer --------------------------------------------------


class ToonyAgentConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket for the frontend UI. Auth via JWT (existing pattern)."""

    async def connect(self):
        self.agent_id = str(self.scope["url_route"]["kwargs"]["agent_id"])
        self.group_name = f"toony_agent_{self.agent_id}"
        user = self.scope.get("user")

        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        if not await _is_org_member(user, self.agent_id):
            await self.close(code=4003)
            return

        self.user = user
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")
        runner_group = f"toony_agent_runner_{self.agent_id}"

        if msg_type == "question.answered":
            task_id = content.get("task_id")
            question_id = content.get("question_id")
            answer = content.get("answer", "")
            if not task_id or not question_id:
                await self.send_json({"type": "error", "message": "task_id and question_id are required"})
                return
            if not await _validate_task_org_member(task_id, self.user):
                await self.send_json({"type": "error", "message": "Task not found"})
                return
            await _answer_task_question(question_id, answer)
            # Fetch max sequence before creating the event so it gets the next slot.
            max_seq = await _get_max_event_sequence(task_id)
            answer_seq = max_seq + 1
            await _create_task_event(
                task_id,
                TaskEventType.QUESTION_ANSWERED,
                {"question_id": question_id, "answer": answer},
                answer_seq,
            )
            await _update_task_status(task_id, AgentTaskStatus.RUNNING)
            # Broadcast QUESTION_ANSWERED event to frontend.
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "task_event",
                    "data": {
                        "task_id": task_id,
                        "event_type": TaskEventType.QUESTION_ANSWERED,
                        "data": {"question_id": question_id, "answer": answer},
                        "sequence": answer_seq,
                    },
                },
            )
            # Fetch session_id and sequence_offset for the runner to resume.
            session_id = await _get_question_session_id(question_id)
            await self.channel_layer.group_send(
                runner_group,
                {
                    "type": "question_answered",
                    "data": {
                        "task_id": task_id,
                        "question_id": question_id,
                        "answer": answer,
                        "session_id": session_id,
                        "sequence_offset": answer_seq + 1,
                    },
                },
            )

        elif msg_type == "task.cancel":
            task_id = content.get("task_id")
            if not task_id:
                await self.send_json({"type": "error", "message": "task_id is required"})
                return
            if not await _validate_task_org_member(task_id, self.user):
                await self.send_json({"type": "error", "message": "Task not found"})
                return
            await _update_task_status(task_id, AgentTaskStatus.CANCELLED)
            await self.channel_layer.group_send(
                runner_group,
                {"type": "task_cancel", "data": {"task_id": task_id}},
            )

        elif msg_type == "task.reply":
            task_id = content.get("task_id")
            message = content.get("message", "")
            if not task_id or not message:
                await self.send_json({"type": "error", "message": "task_id and message are required"})
                return
            if not await _validate_task_org_member(task_id, self.user):
                await self.send_json({"type": "error", "message": "Task not found"})
                return
            task_info = await _get_task_session_info(task_id)
            if not task_info or not task_info.get("session_id"):
                await self.send_json({"type": "error", "message": "No session to reply to"})
                return
            session_id = task_info["session_id"]
            agent_id = str(task_info["toony_agent_id"])
            # Query max sequence so reply events don't collide
            max_seq = await _get_max_event_sequence(task_id)
            reply_seq = max_seq + 1
            # Create REPLY event
            await _create_task_event(
                task_id,
                TaskEventType.REPLY,
                {"message": message},
                reply_seq,
            )
            # Broadcast REPLY event to frontend
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "task_event",
                    "data": {
                        "task_id": task_id,
                        "event_type": TaskEventType.REPLY,
                        "data": {"message": message},
                        "sequence": reply_seq,
                    },
                },
            )
            # Transition COMPLETED -> RUNNING
            await _update_task_status(task_id, AgentTaskStatus.RUNNING)
            # Notify frontend of status change
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "task_status",
                    "data": {"task_id": task_id, "status": "RUNNING"},
                },
            )
            # Forward to runner with sequence offset
            target_runner_group = f"toony_agent_runner_{agent_id}"
            await self.channel_layer.group_send(
                target_runner_group,
                {
                    "type": "task_reply",
                    "data": {
                        "task_id": task_id,
                        "message": message,
                        "session_id": session_id,
                        "sequence_offset": reply_seq,
                    },
                },
            )

        elif msg_type == "config.sync.request":
            await self.channel_layer.group_send(
                runner_group,
                {"type": "config_sync_request", "data": {}},
            )

        elif msg_type == "config.update":
            config_data = {}
            if "max_concurrent_tasks" in content:
                config_data["max_concurrent_tasks"] = content["max_concurrent_tasks"]
            if "max_task_timeout" in content:
                config_data["max_task_timeout"] = content["max_task_timeout"]
            await self.channel_layer.group_send(
                runner_group,
                {"type": "config_update", "data": config_data},
            )

        else:
            await self.send_json({"type": "error", "message": f"Unknown message type: {msg_type}"})

    # Group handlers (receive broadcasts)

    async def agent_status(self, event):
        await self.send_json({"type": "agent.status", **event["data"]})

    async def task_status(self, event):
        await self.send_json({"type": "task.status", **event["data"]})

    async def task_event(self, event):
        await self.send_json({"type": "task.event", **event["data"]})

    async def question_asked(self, event):
        await self.send_json({"type": "question.asked", **event["data"]})

    async def config_sync_status(self, event):
        await self.send_json({"type": "config.sync.status", **event["data"]})

    async def config_update_status(self, event):
        await self.send_json({"type": "config.update.status", **event["data"]})

    async def repo_clone_result(self, event):
        await self.send_json({"type": "repo.clone.result", **event["data"]})
