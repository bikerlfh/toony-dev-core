from django.utils import timezone

from projects.models import ProjectFileTree


def sync_project_file_tree(*, project, tree, branch):
    ft, _ = ProjectFileTree.objects.update_or_create(
        project=project,
        defaults={
            "tree": tree,
            "branch": branch,
            "synced_at": timezone.now(),
        },
    )
    return ft
