from notifications.models import Notification


def list_user_notifications(user, *, is_read=None, organization_id=None):
    qs = (
        Notification.objects.filter(recipient=user)
        .select_related("actor")
    )

    if is_read is not None:
        qs = qs.filter(is_read=is_read)

    if organization_id:
        qs = qs.filter(organization_id=organization_id)

    return qs.order_by("-created_at")


def get_unread_count(user):
    return Notification.objects.filter(recipient=user, is_read=False).count()
