from django.urls import path

from projects.consumers import ProjectConsumer

websocket_urlpatterns = [
    path("ws/projects/<uuid:project_id>/", ProjectConsumer.as_asgi()),
]
