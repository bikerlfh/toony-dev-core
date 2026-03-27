from projects.views.artifact_views import (
    GlobalArtifactDetailView,
    GlobalArtifactListView,
    IssueArtifactDetailView,
    IssueArtifactListCreateView,
)
from projects.views.cycle_views import CycleDetailView, CycleListCreateView
from projects.views.document_views import (
    IssueDocumentDetailView,
    IssueDocumentListCreateView,
)
from projects.views.file_tree_views import ProjectFileTreeView
from projects.views.issue_views import (
    IssueActivityListView,
    IssueCommentDetailView,
    IssueCommentListCreateView,
    IssueDetailView,
    IssueFullDetailView,
    IssueListCreateView,
    UserIssueListView,
)
from projects.views.milestone_views import (
    MilestoneDetailView,
    MilestoneListCreateView,
)
from projects.views.project_views import (
    ProjectDetailView,
    ProjectListCreateView,
    ProjectMemberDetailView,
    ProjectMemberListCreateView,
    ProjectSettingsView,
)
from projects.views.resource_views import (
    ResourceDetailView,
    ResourceListCreateView,
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
    "IssueFullDetailView",
    "IssueCommentListCreateView",
    "IssueCommentDetailView",
    "IssueActivityListView",
    "ResourceListCreateView",
    "ResourceDetailView",
    "UserIssueListView",
    "IssueArtifactListCreateView",
    "IssueArtifactDetailView",
    "GlobalArtifactListView",
    "GlobalArtifactDetailView",
    "IssueDocumentListCreateView",
    "IssueDocumentDetailView",
    "ProjectFileTreeView",
]
