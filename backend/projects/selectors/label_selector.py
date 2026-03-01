from projects.models import Label


def list_organization_labels(organization, *, search=None):
    qs = Label.objects.filter(
        organization=organization,
    )

    if search:
        return qs.filter(name__icontains=search).order_by("name")

    return qs.order_by("name")


def get_label_by_id(organization, label_id):
    return Label.objects.filter(
        organization=organization,
        id=label_id,
    ).first()
