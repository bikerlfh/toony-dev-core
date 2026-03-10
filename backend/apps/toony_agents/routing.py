from django.urls import path

from toony_agents.consumers import ToonyAgentConsumer, ToonyAgentRunnerConsumer

websocket_urlpatterns = [
    path("ws/toony-agents/<uuid:agent_id>/", ToonyAgentConsumer.as_asgi()),
    path("ws/toony-agents/runner/", ToonyAgentRunnerConsumer.as_asgi()),
]
