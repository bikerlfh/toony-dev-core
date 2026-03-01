from django.urls import path

from organizations.views import (
    MemberDetailView,
    MemberListCreateView,
    OrganizationDetailView,
    OrganizationListCreateView,
    OrganizationSettingsView,
)

app_name = "organizations"

urlpatterns = [
    path("", OrganizationListCreateView.as_view(), name="list-create"),
    path("<slug:org_slug>/", OrganizationDetailView.as_view(), name="detail"),
    path("<slug:org_slug>/members/", MemberListCreateView.as_view(), name="members-list-create"),
    path("<slug:org_slug>/members/<uuid:user_id>/", MemberDetailView.as_view(), name="member-detail"),
    path("<slug:org_slug>/settings/", OrganizationSettingsView.as_view(), name="settings"),
]
