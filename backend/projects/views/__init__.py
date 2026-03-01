from projects.views.cycle_views import CycleDetailView, CycleListCreateView
from projects.views.issue_views import (
    IssueActivityListView,
    IssueCommentDetailView,
    IssueCommentListCreateView,
    IssueDetailView,
    IssueListCreateView,
)
from projects.views.label_views import LabelDetailView, LabelListCreateView
from projects.views.milestone_views import MilestoneDetailView, MilestoneListCreateView
from projects.views.project_views import (
    ProjectDetailView,
    ProjectListCreateView,
    ProjectMemberDetailView,
    ProjectMemberListCreateView,
    ProjectSettingsView,
)
from projects.views.team_views import (
    TeamDetailView,
    TeamListCreateView,
    TeamMemberDetailView,
    TeamMemberListCreateView,
)

__all__ = [
    "TeamListCreateView",
    "TeamDetailView",
    "TeamMemberListCreateView",
    "TeamMemberDetailView",
    "LabelListCreateView",
    "LabelDetailView",
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
]
