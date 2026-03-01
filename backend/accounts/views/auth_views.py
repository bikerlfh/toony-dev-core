from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.serializers.input import LoginUserSerializer, RegisterUserSerializer
from accounts.serializers.output import AuthTokenSerializer, UserDetailSerializer
from accounts.services import authenticate_user, create_user


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        request=RegisterUserSerializer,
        responses={201: AuthTokenSerializer},
    )
    def post(self, request):
        serializer = RegisterUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        create_user(
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            last_name=data["last_name"],
        )
        result = authenticate_user(
            email=data["email"],
            password=data["password"],
        )
        output = AuthTokenSerializer(result).data
        return Response(output, status=status.HTTP_201_CREATED)


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
            email=serializer.validated_data["email"],
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
