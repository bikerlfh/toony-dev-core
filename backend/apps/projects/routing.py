from django.urls import path

from projects.consumers import ProjectConsumer, UserIssuesConsumer

websocket_urlpatterns = [
    path("ws/projects/<uuid:project_id>/", ProjectConsumer.as_asgi()),
    path("ws/issues/", UserIssuesConsumer.as_asgi()),
]
