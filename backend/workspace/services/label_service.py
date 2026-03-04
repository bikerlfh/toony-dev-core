from common.exceptions import ConflictError
from workspace.models import Label


def create_label(name, color="#6b7280", description=""):
    if Label.objects.filter(name=name).exists():
        raise ConflictError("A label with this name already exists.")
    return Label.objects.create(name=name, color=color, description=description)


def update_label(label, **kwargs):
    allowed_fields = {"name", "color", "description"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(label, field, value)
    label.save()
    return label


def delete_label(label):
    label.delete()
