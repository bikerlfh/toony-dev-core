from django.utils import timezone

from projects.models import ProjectFileTree


def sync_project_file_tree(*, project, tree, branch, skills=None):
    defaults = {
        "tree": tree,
        "branch": branch,
        "synced_at": timezone.now(),
    }
    if skills is not None:
        defaults["skills"] = skills
    ft, _ = ProjectFileTree.objects.update_or_create(
        project=project,
        defaults=defaults,
    )
    return ft
