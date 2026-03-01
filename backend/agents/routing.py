from django.urls import path

from agents.consumers import AgentConsumer

websocket_urlpatterns = [
    path("ws/agents/<uuid:agent_id>/", AgentConsumer.as_asgi()),
]
