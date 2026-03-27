from projects.models import ProjectFileTree


def get_project_file_tree(project):
    return ProjectFileTree.objects.filter(project=project).first()
