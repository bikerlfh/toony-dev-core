from django.urls import path

from importers.views import (
    ExternalProjectsView,
    ImportJobDetailView,
    ImportJobListCreateView,
    ImportJobMappingsView,
)

app_name = "importers"

urlpatterns = [
    path("imports/", ImportJobListCreateView.as_view(), name="import-list-create"),
    path("imports/external-projects/", ExternalProjectsView.as_view(), name="external-projects"),
    path("imports/<uuid:job_id>/", ImportJobDetailView.as_view(), name="import-detail"),
    path("imports/<uuid:job_id>/mappings/", ImportJobMappingsView.as_view(), name="import-mappings"),
]
