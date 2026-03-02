from django.urls import path

from agents.views import (
    AgentDetailView,
    AgentListCreateView,
    AgentSkillDetailView,
    AgentSkillListCreateView,
    SkillDetailView,
    SkillListCreateView,
    SkillVersionListView,
)

app_name = "agents"

urlpatterns = [
    # Agents
    path("agents/", AgentListCreateView.as_view(), name="agent-list-create"),
    path("agents/<slug:agent_slug>/", AgentDetailView.as_view(), name="agent-detail"),
    path("agents/<slug:agent_slug>/skills/", AgentSkillListCreateView.as_view(), name="agent-skill-list-create"),
    path(
        "agents/<slug:agent_slug>/skills/<uuid:agent_skill_id>/",
        AgentSkillDetailView.as_view(),
        name="agent-skill-detail",
    ),
    # Skills
    path("skills/", SkillListCreateView.as_view(), name="skill-list-create"),
    path("skills/<slug:skill_slug>/", SkillDetailView.as_view(), name="skill-detail"),
    path("skills/<slug:skill_slug>/versions/", SkillVersionListView.as_view(), name="skill-version-list"),
]
