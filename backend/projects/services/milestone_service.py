from projects.models import Milestone


def create_milestone(project, name, **kwargs):
    return Milestone.objects.create(
        project=project,
        name=name,
        **kwargs,
    )


def update_milestone(milestone, **kwargs):
    allowed_fields = {"name", "description", "target_date", "status", "sort_order"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(milestone, field, value)
    milestone.save()
    return milestone


def delete_milestone(milestone):
    milestone.delete()
