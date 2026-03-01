from django.urls import path

from projects.views import (
    CycleDetailView,
    CycleListCreateView,
    LabelDetailView,
    LabelListCreateView,
    MilestoneDetailView,
    MilestoneListCreateView,
    ProjectDetailView,
    ProjectListCreateView,
    ProjectMemberDetailView,
    ProjectMemberListCreateView,
    ProjectSettingsView,
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
    # Projects
    path("projects/", ProjectListCreateView.as_view(), name="project-list-create"),
    path("projects/<slug:project_slug>/", ProjectDetailView.as_view(), name="project-detail"),
    path("projects/<slug:project_slug>/members/", ProjectMemberListCreateView.as_view(), name="project-member-list-create"),
    path("projects/<slug:project_slug>/members/<uuid:user_id>/", ProjectMemberDetailView.as_view(), name="project-member-detail"),
    path("projects/<slug:project_slug>/settings/", ProjectSettingsView.as_view(), name="project-settings"),
    # Milestones
    path("projects/<slug:project_slug>/milestones/", MilestoneListCreateView.as_view(), name="milestone-list-create"),
    path("projects/<slug:project_slug>/milestones/<uuid:milestone_id>/", MilestoneDetailView.as_view(), name="milestone-detail"),
    # Cycles
    path("projects/<slug:project_slug>/cycles/", CycleListCreateView.as_view(), name="cycle-list-create"),
    path("projects/<slug:project_slug>/cycles/<uuid:cycle_id>/", CycleDetailView.as_view(), name="cycle-detail"),
]
