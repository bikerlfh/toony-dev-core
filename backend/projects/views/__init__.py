from projects.views.label_views import LabelDetailView, LabelListCreateView
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
]
