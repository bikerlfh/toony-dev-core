from django.urls import path

from agents.consumers import SubAgentConsumer

websocket_urlpatterns = [
    path("ws/subagents/<uuid:sub_agent_id>/", SubAgentConsumer.as_asgi()),
]
