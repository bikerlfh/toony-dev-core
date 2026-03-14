from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from projects.views import (
    GlobalArtifactDetailView,
    GlobalArtifactListView,
    IssueFullDetailView,
    UserIssueListView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", include("common.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/organizations/", include("organizations.urls")),
    path("api/workspace/", include("workspace.urls")),
    path("api/issues/", UserIssueListView.as_view(), name="user-issue-list"),
    path("api/issues/<str:issue_id>/", IssueFullDetailView.as_view(), name="issue-full-detail"),
    path("api/artifacts/", GlobalArtifactListView.as_view(), name="artifact-list"),
    path("api/artifacts/<uuid:artifact_id>/", GlobalArtifactDetailView.as_view(), name="artifact-detail"),
    path("api/projects/", include("projects.urls")),
    path("api/", include("agents.urls")),
    path("api/", include("workflows.urls")),
    path("api/organizations/<uuid:org_id>/", include("importers.urls")),
    path("api/", include("toony_agents.urls")),
    path("api/search/", include("organizations.search_urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
