from projects.models import Label


def list_organization_labels(organization):
    return Label.objects.filter(
        organization=organization,
    ).order_by("name")


def get_label_by_id(organization, label_id):
    return Label.objects.filter(
        organization=organization,
        id=label_id,
    ).first()
