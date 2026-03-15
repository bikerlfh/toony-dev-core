from django.urls import path

from notifications.views import (
    DeleteAllNotificationsView,
    DeleteNotificationsView,
    MarkAllReadView,
    MarkReadView,
    NotificationListView,
    UnreadCountView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("mark-read/", MarkReadView.as_view(), name="notification-mark-read"),
    path("mark-all-read/", MarkAllReadView.as_view(), name="notification-mark-all-read"),
    path("delete/", DeleteNotificationsView.as_view(), name="notification-delete"),
    path("delete-all/", DeleteAllNotificationsView.as_view(), name="notification-delete-all"),
    path("unread-count/", UnreadCountView.as_view(), name="notification-unread-count"),
]
