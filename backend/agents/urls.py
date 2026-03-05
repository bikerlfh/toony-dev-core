from django.urls import path

from agents.views import (
    SubAgentDetailView,
    SubAgentListCreateView,
    SubAgentSkillDetailView,
    SubAgentSkillListCreateView,
    SkillDetailView,
    SkillListCreateView,
    SkillVersionListView,
)

app_name = "agents"

urlpatterns = [
    # SubAgents
    path("subagents/", SubAgentListCreateView.as_view(), name="sub-agent-list-create"),
    path("subagents/<uuid:sub_agent_id>/", SubAgentDetailView.as_view(), name="sub-agent-detail"),
    path(
        "subagents/<uuid:sub_agent_id>/skills/",
        SubAgentSkillListCreateView.as_view(),
        name="sub-agent-skill-list-create",
    ),
    path(
        "subagents/<uuid:sub_agent_id>/skills/<uuid:sub_agent_skill_id>/",
        SubAgentSkillDetailView.as_view(),
        name="sub-agent-skill-detail",
    ),
    # Skills
    path("skills/", SkillListCreateView.as_view(), name="skill-list-create"),
    path("skills/<uuid:skill_id>/", SkillDetailView.as_view(), name="skill-detail"),
    path("skills/<uuid:skill_id>/versions/", SkillVersionListView.as_view(), name="skill-version-list"),
]
