from django.urls import path

from workflows.views import (
    WorkflowDetailView,
    WorkflowEdgeDetailView,
    WorkflowEdgeListCreateView,
    WorkflowListCreateView,
    WorkflowNodeDetailView,
    WorkflowNodeListCreateView,
    WorkflowResolveView,
)

app_name = "workflows"

urlpatterns = [
    path("workflows/", WorkflowListCreateView.as_view(), name="workflow-list-create"),
    path("workflows/<uuid:workflow_id>/", WorkflowDetailView.as_view(), name="workflow-detail"),
    path("workflows/<uuid:workflow_id>/nodes/", WorkflowNodeListCreateView.as_view(), name="workflow-node-list-create"),
    path(
        "workflows/<uuid:workflow_id>/nodes/<uuid:node_id>/",
        WorkflowNodeDetailView.as_view(),
        name="workflow-node-detail",
    ),
    path("workflows/<uuid:workflow_id>/edges/", WorkflowEdgeListCreateView.as_view(), name="workflow-edge-list-create"),
    path(
        "workflows/<uuid:workflow_id>/edges/<uuid:edge_id>/",
        WorkflowEdgeDetailView.as_view(),
        name="workflow-edge-detail",
    ),
    path("workflows/resolve/<uuid:issue_id>/", WorkflowResolveView.as_view(), name="workflow-resolve"),
]
