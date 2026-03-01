from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", include("common.urls")),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/organizations/", include("organizations.urls")),
    path("api/v1/organizations/<slug:org_slug>/", include("projects.urls")),
    path("api/v1/organizations/<slug:org_slug>/", include("agents.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
