from django.urls import path

from workflows.views import WorkflowDetailView, WorkflowListCreateView

app_name = "workflows"

urlpatterns = [
    path("workflows/", WorkflowListCreateView.as_view(), name="workflow-list-create"),
    path("workflows/<uuid:workflow_id>/", WorkflowDetailView.as_view(), name="workflow-detail"),
]
