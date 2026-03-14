from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.serializers.input import (
    ChangePasswordSerializer,
    LoginUserSerializer,
    UpdateProfileSerializer,
)
from accounts.serializers.output import (
    AuthTokenSerializer,
    UserDetailSerializer,
)
from accounts.services import (
    authenticate_user,
    change_password,
    update_profile,
)


class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        request=LoginUserSerializer,
        responses={200: AuthTokenSerializer},
    )
    def post(self, request):
        serializer = LoginUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = authenticate_user(
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        output = AuthTokenSerializer(result).data
        return Response(output, status=status.HTTP_200_OK)


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        responses={200: UserDetailSerializer},
    )
    def get(self, request):
        serializer = UserDetailSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Auth"],
        request=UpdateProfileSerializer,
        responses={200: UserDetailSerializer},
    )
    def put(self, request):
        serializer = UpdateProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = update_profile(request.user, **serializer.validated_data)
        output = UserDetailSerializer(user).data
        return Response(output, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        request=ChangePasswordSerializer,
        responses={204: None},
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        change_password(
            user=request.user,
            current_password=serializer.validated_data["current_password"],
            new_password=serializer.validated_data["new_password"],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
