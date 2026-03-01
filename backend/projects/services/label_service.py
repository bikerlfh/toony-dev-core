from common.exceptions import ConflictError
from projects.models import Label


def create_label(organization, name, color="#6b7280", description=""):
    existing = Label.objects.filter(
        organization=organization, name=name,
    ).exists()
    if existing:
        raise ConflictError(
            "A label with this name already exists in the organization."
        )

    return Label.objects.create(
        organization=organization,
        name=name,
        color=color,
        description=description,
    )


def update_label(label, **kwargs):
    allowed_fields = {"name", "color", "description"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(label, field, value)
    label.save()
    return label


def delete_label(label):
    label.delete()
