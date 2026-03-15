from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from notifications.models import Notification
from notifications.selectors import get_unread_count, list_user_notifications
from notifications.serializers.input import (
    DeleteNotificationsSerializer,
    MarkAllReadSerializer,
    MarkReadSerializer,
)
from notifications.serializers.output import NotificationSerializer


class NotificationListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        is_read = request.query_params.get("is_read")
        if is_read is not None:
            is_read = is_read.lower() == "true"

        organization_id = request.query_params.get("organization_id")

        notifications = list_user_notifications(
            request.user,
            is_read=is_read,
            organization_id=organization_id,
        )
        return self.paginate(notifications, NotificationSerializer, request)


class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        now = timezone.now()
        updated = Notification.objects.filter(
            recipient=request.user,
            id__in=serializer.validated_data["ids"],
            is_read=False,
        ).update(is_read=True, read_at=now)

        return Response({"updated": updated}, status=status.HTTP_200_OK)


class MarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MarkAllReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        qs = Notification.objects.filter(recipient=request.user, is_read=False)

        org_id = serializer.validated_data.get("organization_id")
        if org_id:
            qs = qs.filter(organization_id=org_id)

        now = timezone.now()
        updated = qs.update(is_read=True, read_at=now)

        return Response({"updated": updated}, status=status.HTTP_200_OK)


class DeleteNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeleteNotificationsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        deleted, _ = Notification.objects.filter(
            recipient=request.user,
            id__in=serializer.validated_data["ids"],
        ).delete()

        return Response({"deleted": deleted}, status=status.HTTP_200_OK)


class DeleteAllNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        deleted, _ = Notification.objects.filter(
            recipient=request.user,
        ).delete()

        return Response({"deleted": deleted}, status=status.HTTP_200_OK)


class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = get_unread_count(request.user)
        return Response({"count": count}, status=status.HTTP_200_OK)
