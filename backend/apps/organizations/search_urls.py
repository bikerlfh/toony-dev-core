from django.urls import path

from organizations.views import GlobalSearchView

urlpatterns = [
    path("<uuid:org_id>/", GlobalSearchView.as_view(), name="global-search"),
]
