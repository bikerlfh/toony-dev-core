from django.urls import path

from organizations.views import (
    CredentialDetailView,
    CredentialListCreateView,
    IntegrationDetailView,
    IntegrationListCreateView,
    MemberDetailView,
    MemberListCreateView,
    OrganizationDetailView,
    OrganizationListCreateView,
    OrganizationSettingsView,
)

app_name = "organizations"

urlpatterns = [
    path("", OrganizationListCreateView.as_view(), name="list-create"),
    path("<uuid:org_id>/", OrganizationDetailView.as_view(), name="detail"),
    path("<uuid:org_id>/members/", MemberListCreateView.as_view(), name="members-list-create"),
    path("<uuid:org_id>/members/<uuid:user_id>/", MemberDetailView.as_view(), name="member-detail"),
    path("<uuid:org_id>/settings/", OrganizationSettingsView.as_view(), name="settings"),
    path("<uuid:org_id>/credentials/", CredentialListCreateView.as_view(), name="credentials-list-create"),
    path("<uuid:org_id>/credentials/<uuid:credential_id>/", CredentialDetailView.as_view(), name="credential-detail"),
    path("<uuid:org_id>/integrations/", IntegrationListCreateView.as_view(), name="integrations-list-create"),
    path(
        "<uuid:org_id>/integrations/<uuid:integration_id>/", IntegrationDetailView.as_view(), name="integration-detail"
    ),
]
