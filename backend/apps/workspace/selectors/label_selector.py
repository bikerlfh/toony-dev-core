from workspace.models import Label


def list_labels(*, search=None):
    qs = Label.objects.all()
    if search:
        qs = qs.filter(name__icontains=search)
    return qs


def get_label_by_id(label_id):
    return Label.objects.filter(id=label_id).first()
