from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.selectors.api_key_selector import get_api_key_by_id, list_user_api_keys
from accounts.serializers.api_key_serializers import (
    APIKeyCreatedSerializer,
    APIKeyOutputSerializer,
    CreateAPIKeySerializer,
)
from accounts.services.api_key_service import generate_api_key, revoke_api_key
from common.mixins import PaginatedViewMixin


class APIKeyListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        keys = list_user_api_keys(request.user)
        return self.paginate(keys, APIKeyOutputSerializer, request)

    def post(self, request):
        serializer = CreateAPIKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        key_obj, raw_key = generate_api_key(
            user=request.user,
            name=serializer.validated_data["name"],
        )

        output = APIKeyCreatedSerializer(key_obj).data
        output["raw_key"] = raw_key
        return Response(output, status=status.HTTP_201_CREATED)


class APIKeyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, key_id):
        api_key = get_api_key_by_id(request.user, key_id)
        if api_key is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        revoke_api_key(api_key)
        return Response(status=status.HTTP_204_NO_CONTENT)
