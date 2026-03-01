from agents.routing import websocket_urlpatterns as agent_ws
from projects.routing import websocket_urlpatterns as project_ws

websocket_urlpatterns = project_ws + agent_ws
