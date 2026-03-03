from agents.routing import websocket_urlpatterns as agent_ws
from projects.routing import websocket_urlpatterns as project_ws
from toony_agents.routing import websocket_urlpatterns as toony_agent_ws

websocket_urlpatterns = project_ws + agent_ws + toony_agent_ws
