from django.urls import path

from toony_agents.views.agent_task_views import (
    AgentSystemEventListView,
    AgentTaskCancelView,
    AgentTaskDetailView,
    AgentTaskListCreateView,
    TaskEventListView,
)
from toony_agents.views.toony_agent_views import (
    ToonyAgentDetailView,
    ToonyAgentKeyListCreateView,
    ToonyAgentKeyRevokeView,
    ToonyAgentListCreateView,
)

urlpatterns = [
    path(
        "toony-agents/",
        ToonyAgentListCreateView.as_view(),
        name="toony-agent-list-create",
    ),
    path(
        "toony-agents/<uuid:agent_id>/",
        ToonyAgentDetailView.as_view(),
        name="toony-agent-detail",
    ),
    path(
        "toony-agents/<uuid:agent_id>/keys/",
        ToonyAgentKeyListCreateView.as_view(),
        name="toony-agent-key-list-create",
    ),
    path(
        "toony-agents/<uuid:agent_id>/keys/<uuid:key_id>/",
        ToonyAgentKeyRevokeView.as_view(),
        name="toony-agent-key-revoke",
    ),
    path(
        "toony-agents/<uuid:agent_id>/tasks/",
        AgentTaskListCreateView.as_view(),
        name="agent-task-list-create",
    ),
    path(
        "toony-agents/<uuid:agent_id>/tasks/<uuid:task_id>/",
        AgentTaskDetailView.as_view(),
        name="agent-task-detail",
    ),
    path(
        "toony-agents/<uuid:agent_id>/tasks/<uuid:task_id>/cancel/",
        AgentTaskCancelView.as_view(),
        name="agent-task-cancel",
    ),
    path(
        "toony-agents/<uuid:agent_id>/tasks/<uuid:task_id>/events/",
        TaskEventListView.as_view(),
        name="task-event-list",
    ),
    path(
        "toony-agents/<uuid:agent_id>/system-events/",
        AgentSystemEventListView.as_view(),
        name="agent-system-event-list",
    ),
]
