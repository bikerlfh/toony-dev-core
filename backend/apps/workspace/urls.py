from django.urls import path

from workspace.views import (
    LabelDetailView,
    LabelListCreateView,
    TeamDetailView,
    TeamListCreateView,
    TeamMemberDetailView,
    TeamMemberListCreateView,
)

urlpatterns = [
    # Labels
    path("labels/", LabelListCreateView.as_view(), name="workspace-label-list"),
    path("labels/<uuid:label_id>/", LabelDetailView.as_view(), name="workspace-label-detail"),
    # Teams
    path("teams/", TeamListCreateView.as_view(), name="workspace-team-list"),
    path("teams/<uuid:team_id>/", TeamDetailView.as_view(), name="workspace-team-detail"),
    path("teams/<uuid:team_id>/members/", TeamMemberListCreateView.as_view(), name="workspace-team-member-list"),
    path(
        "teams/<uuid:team_id>/members/<uuid:user_id>/",
        TeamMemberDetailView.as_view(),
        name="workspace-team-member-detail",
    ),
]
