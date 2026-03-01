from projects.models import Cycle
from projects.selectors import get_next_cycle_number


def create_cycle(project, name, start_date, end_date, **kwargs):
    number = get_next_cycle_number(project)
    return Cycle.objects.create(
        project=project,
        name=name,
        number=number,
        start_date=start_date,
        end_date=end_date,
        **kwargs,
    )


def update_cycle(cycle, **kwargs):
    allowed_fields = {"name", "start_date", "end_date", "status"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(cycle, field, value)
    cycle.save()
    return cycle


def delete_cycle(cycle):
    cycle.delete()
