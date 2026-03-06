from projects.views.cycle_views import CycleDetailView, CycleListCreateView
from projects.views.resource_views import ResourceDetailView, ResourceListCreateView
from projects.views.issue_views import (
    IssueActivityListView,
    IssueCommentDetailView,
    IssueCommentListCreateView,
    IssueDetailView,
    IssueListCreateView,
    UserIssueListView,
)
from projects.views.milestone_views import MilestoneDetailView, MilestoneListCreateView
from projects.views.project_views import (
    ProjectDetailView,
    ProjectListCreateView,
    ProjectMemberDetailView,
    ProjectMemberListCreateView,
    ProjectSettingsView,
)

__all__ = [
    "ProjectListCreateView",
    "ProjectDetailView",
    "ProjectMemberListCreateView",
    "ProjectMemberDetailView",
    "ProjectSettingsView",
    "MilestoneListCreateView",
    "MilestoneDetailView",
    "CycleListCreateView",
    "CycleDetailView",
    "IssueListCreateView",
    "IssueDetailView",
    "IssueCommentListCreateView",
    "IssueCommentDetailView",
    "IssueActivityListView",
    "ResourceListCreateView",
    "ResourceDetailView",
    "UserIssueListView",
]
