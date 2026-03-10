from django.urls import path

from accounts.views import (
    APIKeyDetailView,
    APIKeyListCreateView,
    ChangePasswordView,
    LoginView,
    MeView,
    RefreshView,
)

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("api-keys/", APIKeyListCreateView.as_view(), name="api-key-list-create"),
    path("api-keys/<uuid:key_id>/", APIKeyDetailView.as_view(), name="api-key-detail"),
]
