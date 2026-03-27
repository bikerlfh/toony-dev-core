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


class TestFileTreeSelector:
    def test_get_file_tree_exists(self, project):
        ProjectFileTreeFactory(project=project)
        from projects.selectors import get_project_file_tree

        ft = get_project_file_tree(project)
        assert ft is not None
        assert ft.project == project
        assert len(ft.tree) == 3

    def test_get_file_tree_not_exists(self, project):
        from projects.selectors import get_project_file_tree

        ft = get_project_file_tree(project)
        assert ft is None


class TestFileTreeService:
    def test_sync_creates_new(self, project):
        from projects.services import sync_project_file_tree

        ft = sync_project_file_tree(
            project=project,
            tree=["src/index.ts", "package.json"],
            branch="main",
        )
        assert ft.project == project
        assert ft.tree == ["src/index.ts", "package.json"]
        assert ft.branch == "main"

    def test_sync_updates_existing(self, project):
        from projects.services import sync_project_file_tree

        sync_project_file_tree(project=project, tree=["old.py"], branch="main")
        ft = sync_project_file_tree(project=project, tree=["new.py"], branch="develop")

        assert ft.tree == ["new.py"]
        assert ft.branch == "develop"
