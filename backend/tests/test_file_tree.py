import pytest
from rest_framework import status

from tests.factories import ProjectFileTreeFactory

pytestmark = pytest.mark.django_db


def file_tree_url(project_id):
    return f"/api/projects/{project_id}/file-tree/"


class TestProjectFileTreeModel:
    def test_create_file_tree(self, project):
        from projects.models import ProjectFileTree

        ft = ProjectFileTree.objects.create(
            project=project,
            tree=["src/app.tsx", "src/lib/api.ts", "README.md"],
            branch="main",
            synced_at="2026-03-26T12:00:00Z",
        )
        assert ft.project == project
        assert len(ft.tree) == 3
        assert ft.branch == "main"
