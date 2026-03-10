from django.urls import path

from projects.views import (
    CycleDetailView,
    CycleListCreateView,
    IssueActivityListView,
    IssueArtifactDetailView,
    IssueArtifactListCreateView,
    IssueCommentDetailView,
    IssueCommentListCreateView,
    IssueDetailView,
    IssueDocumentDetailView,
    IssueDocumentListCreateView,
    IssueListCreateView,
    MilestoneDetailView,
    MilestoneListCreateView,
    ProjectDetailView,
    ProjectListCreateView,
    ProjectMemberDetailView,
    ProjectMemberListCreateView,
    ProjectSettingsView,
    ResourceDetailView,
    ResourceListCreateView,
)
from workspace.views import ProjectTeamDetailView, ProjectTeamListCreateView

app_name = "projects"

urlpatterns = [
    # Projects
    path("", ProjectListCreateView.as_view(), name="project-list-create"),
    path("<uuid:project_id>/", ProjectDetailView.as_view(), name="project-detail"),
    path("<uuid:project_id>/members/", ProjectMemberListCreateView.as_view(), name="project-member-list-create"),
    path("<uuid:project_id>/members/<uuid:user_id>/", ProjectMemberDetailView.as_view(), name="project-member-detail"),
    path("<uuid:project_id>/settings/", ProjectSettingsView.as_view(), name="project-settings"),
    # Project Teams
    path("<uuid:project_id>/teams/", ProjectTeamListCreateView.as_view(), name="project-team-list-create"),
    path("<uuid:project_id>/teams/<uuid:team_id>/", ProjectTeamDetailView.as_view(), name="project-team-detail"),
    # Resources
    path("<uuid:project_id>/resources/", ResourceListCreateView.as_view(), name="resource-list-create"),
    path("<uuid:project_id>/resources/<uuid:resource_id>/", ResourceDetailView.as_view(), name="resource-detail"),
    # Milestones
    path("<uuid:project_id>/milestones/", MilestoneListCreateView.as_view(), name="milestone-list-create"),
    path("<uuid:project_id>/milestones/<uuid:milestone_id>/", MilestoneDetailView.as_view(), name="milestone-detail"),
    # Cycles
    path("<uuid:project_id>/cycles/", CycleListCreateView.as_view(), name="cycle-list-create"),
    path("<uuid:project_id>/cycles/<uuid:cycle_id>/", CycleDetailView.as_view(), name="cycle-detail"),
    # Issues
    path("<uuid:project_id>/issues/", IssueListCreateView.as_view(), name="issue-list-create"),
    path("<uuid:project_id>/issues/<uuid:issue_id>/", IssueDetailView.as_view(), name="issue-detail"),
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/comments/",
        IssueCommentListCreateView.as_view(),
        name="issue-comment-list-create",
    ),
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/comments/<uuid:comment_id>/",
        IssueCommentDetailView.as_view(),
        name="issue-comment-detail",
    ),
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/activities/",
        IssueActivityListView.as_view(),
        name="issue-activity-list",
    ),
    # Artifacts
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/artifacts/",
        IssueArtifactListCreateView.as_view(),
        name="issue-artifact-list-create",
    ),
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/artifacts/<uuid:artifact_id>/",
        IssueArtifactDetailView.as_view(),
        name="issue-artifact-detail",
    ),
    # Documents
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/documents/",
        IssueDocumentListCreateView.as_view(),
        name="issue-document-list-create",
    ),
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/documents/<uuid:document_id>/",
        IssueDocumentDetailView.as_view(),
        name="issue-document-detail",
    ),
]
