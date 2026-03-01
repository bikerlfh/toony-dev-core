from django.urls import path

from projects.views import (
    LabelDetailView,
    LabelListCreateView,
    TeamDetailView,
    TeamListCreateView,
    TeamMemberDetailView,
    TeamMemberListCreateView,
)

app_name = "projects"

urlpatterns = [
    # Teams
    path("teams/", TeamListCreateView.as_view(), name="team-list-create"),
    path("teams/<slug:team_slug>/", TeamDetailView.as_view(), name="team-detail"),
    path("teams/<slug:team_slug>/members/", TeamMemberListCreateView.as_view(), name="team-member-list-create"),
    path("teams/<slug:team_slug>/members/<uuid:user_id>/", TeamMemberDetailView.as_view(), name="team-member-detail"),
    # Labels
    path("labels/", LabelListCreateView.as_view(), name="label-list-create"),
    path("labels/<uuid:label_id>/", LabelDetailView.as_view(), name="label-detail"),
]
