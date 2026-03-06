# Auth Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch login from email to username, remove public registration, add profile update page.

**Architecture:** Backend changes to User model (USERNAME_FIELD → username), auth service/serializers/views. Remove register endpoint entirely. Add PUT on /api/auth/me/ for profile updates and POST /api/auth/me/change-password/ for password changes. Frontend: update login page, delete register page, add /profile route.

**Tech Stack:** Django 5, DRF, SimpleJWT, Next.js 15, React 19, Tailwind CSS v4, Axios

---

### Task 1: Backend — Update User Model to Use Username

**Files:**
- Modify: `backend/accounts/models/user.py`
- Modify: `backend/accounts/admin.py`

**Step 1: Update the User model and UserManager**

Replace `backend/accounts/models/user.py` with:

```python
import uuid

from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager):
    def create_user(self, username, email=None, password=None, **extra_fields):
        if not username:
            raise ValueError("The Username field must be set")
        if email:
            email = self.normalize_email(email)
        return super().create_user(
            username=username,
            email=email or "",
            password=password,
            **extra_fields,
        )

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if email:
            email = self.normalize_email(email)
        return super().create_superuser(
            username=username,
            email=email or "",
            password=password,
            **extra_fields,
        )


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(blank=True, default="")
    avatar = models.ImageField(upload_to="avatars/", blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        db_table = "users"
        ordering = ["-created_at"]

    def __str__(self):
        return self.username
```

Key changes:
- `USERNAME_FIELD = "username"` (was `"email"`)
- `email` no longer `unique=True`, now `blank=True, default=""`
- `UserManager.create_user` takes `username` as first arg, email is optional
- `UserManager.create_superuser` same
- `__str__` returns `self.username`

**Step 2: Update Django admin**

Replace `backend/accounts/admin.py` with:

```python
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from accounts.models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "email", "first_name", "last_name", "is_staff", "created_at")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("-created_at",)

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "email", "avatar")}),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "first_name", "last_name", "email", "password1", "password2"),
            },
        ),
    )
```

**Step 3: Generate and apply migration**

Run: `docker compose exec backend python manage.py makemigrations accounts`

This will generate a migration that removes `unique=True` from `email` and changes defaults. Review the migration file before applying.

Run: `docker compose exec backend python manage.py migrate`

**Step 4: Commit**

```bash
git add backend/accounts/models/user.py backend/accounts/admin.py backend/accounts/migrations/
git commit -m "feat(accounts): switch USERNAME_FIELD from email to username"
```

---

### Task 2: Backend — Update Login Serializer and Service

**Files:**
- Modify: `backend/accounts/serializers/input.py`
- Modify: `backend/accounts/services/user_service.py`
- Modify: `backend/accounts/selectors/user_selector.py`
- Modify: `backend/accounts/selectors/__init__.py`
- Modify: `backend/accounts/services/__init__.py`

**Step 1: Update input serializers — remove RegisterUserSerializer, update LoginUserSerializer**

Replace `backend/accounts/serializers/input.py` with:

```python
from django.contrib.auth import password_validation
from rest_framework import serializers


class LoginUserSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class UpdateProfileSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(required=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value
```

**Step 2: Update user_service.py — remove create_user, update authenticate_user, add update_profile and change_password**

Replace `backend/accounts/services/user_service.py` with:

```python
from django.contrib.auth import authenticate
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework_simplejwt.tokens import RefreshToken


def authenticate_user(username, password):
    user = authenticate(username=username, password=password)
    if user is None:
        raise AuthenticationFailed("Invalid username or password.")

    refresh = RefreshToken.for_user(user)
    return {
        "user": user,
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def update_profile(user, **fields):
    for key, value in fields.items():
        setattr(user, key, value)
    user.save(update_fields=list(fields.keys()) + ["updated_at"])
    return user


def change_password(user, current_password, new_password):
    if not user.check_password(current_password):
        raise ValidationError({"current_password": ["Current password is incorrect."]})
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
```

**Step 3: Remove get_user_by_email from selectors (no longer used)**

Replace `backend/accounts/selectors/user_selector.py` with:

```python
from accounts.models import User


def get_user_by_id(user_id):
    return User.objects.filter(id=user_id).first()
```

**Step 4: Update selectors __init__.py**

Replace `backend/accounts/selectors/__init__.py` with:

```python
from accounts.selectors.user_selector import get_user_by_id

__all__ = ["get_user_by_id"]
```

**Step 5: Update services __init__.py**

Replace `backend/accounts/services/__init__.py` with:

```python
from accounts.services.user_service import authenticate_user, update_profile, change_password

__all__ = ["authenticate_user", "update_profile", "change_password"]
```

**Step 6: Commit**

```bash
git add backend/accounts/serializers/input.py backend/accounts/services/user_service.py backend/accounts/selectors/user_selector.py backend/accounts/selectors/__init__.py backend/accounts/services/__init__.py
git commit -m "feat(accounts): update login to username, add profile/password services, remove registration"
```

---

### Task 3: Backend — Update Views and URLs

**Files:**
- Modify: `backend/accounts/views/auth_views.py`
- Modify: `backend/accounts/views/__init__.py`
- Modify: `backend/accounts/urls.py`
- Modify: `backend/accounts/serializers/output.py`

**Step 1: Update output serializer to include username**

Replace `backend/accounts/serializers/output.py` with:

```python
from rest_framework import serializers

from accounts.models import User


class UserDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "avatar",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AuthTokenSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)
    user = UserDetailSerializer(read_only=True)
```

**Step 2: Update views — remove RegisterView, update LoginView, add PUT to MeView, add ChangePasswordView**

Replace `backend/accounts/views/auth_views.py` with:

```python
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
from accounts.serializers.output import AuthTokenSerializer, UserDetailSerializer
from accounts.services import authenticate_user, change_password, update_profile


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
```

**Step 3: Update views __init__.py**

Replace `backend/accounts/views/__init__.py` with:

```python
from accounts.views.auth_views import ChangePasswordView, LoginView, MeView, RefreshView

__all__ = ["LoginView", "RefreshView", "MeView", "ChangePasswordView"]
```

**Step 4: Update URLs — remove register, add change-password**

Replace `backend/accounts/urls.py` with:

```python
from django.urls import path

from accounts.views import ChangePasswordView, LoginView, MeView, RefreshView

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/", ChangePasswordView.as_view(), name="change-password"),
]
```

**Step 5: Commit**

```bash
git add backend/accounts/views/auth_views.py backend/accounts/views/__init__.py backend/accounts/urls.py backend/accounts/serializers/output.py
git commit -m "feat(accounts): update views/URLs — remove register, add profile update and change password"
```

---

### Task 4: Backend — Update Tests

**Files:**
- Modify: `backend/tests/test_accounts.py`
- Modify: `backend/tests/factories.py`

**Step 1: Update UserFactory to use username as primary identifier**

In `backend/tests/factories.py`, update `UserFactory`:

```python
class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.username}@test.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    password = factory.PostGenerationMethodCall("set_password", "testpass123")
```

**Step 2: Rewrite test_accounts.py**

Replace `backend/tests/test_accounts.py` with:

```python
import pytest
from rest_framework import status

from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

LOGIN_URL = "/api/auth/login/"
REFRESH_URL = "/api/auth/refresh/"
ME_URL = "/api/auth/me/"
CHANGE_PASSWORD_URL = "/api/auth/me/change-password/"


class TestLogin:
    def test_login_success(self, api_client):
        UserFactory(username="loginuser")
        data = {"username": "loginuser", "password": "testpass123"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["username"] == "loginuser"

    def test_login_wrong_password(self, api_client):
        UserFactory(username="wrongpw")
        data = {"username": "wrongpw", "password": "badpassword"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_nonexistent_user(self, api_client):
        data = {"username": "noone", "password": "whatever123"}
        response = api_client.post(LOGIN_URL, data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestRegisterRemoved:
    def test_register_endpoint_gone(self, api_client):
        response = api_client.post("/api/auth/register/", {})
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestTokenRefresh:
    def test_refresh_valid(self, api_client):
        UserFactory(username="refreshuser")
        login = api_client.post(
            LOGIN_URL, {"username": "refreshuser", "password": "testpass123"}
        )
        refresh_token = login.data["refresh"]
        response = api_client.post(REFRESH_URL, {"refresh": refresh_token})
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data

    def test_refresh_invalid(self, api_client):
        response = api_client.post(REFRESH_URL, {"refresh": "invalid-token"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestMe:
    def test_me_authenticated(self, authenticated_client, user):
        response = authenticated_client.get(ME_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["username"] == user.username

    def test_me_unauthenticated(self, api_client):
        response = api_client.get(ME_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestUpdateProfile:
    def test_update_profile(self, authenticated_client):
        response = authenticated_client.put(
            ME_URL,
            {"first_name": "Updated", "last_name": "Name", "email": "new@test.com"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["first_name"] == "Updated"
        assert response.data["last_name"] == "Name"
        assert response.data["email"] == "new@test.com"

    def test_update_profile_partial(self, authenticated_client):
        response = authenticated_client.put(ME_URL, {"first_name": "OnlyFirst"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["first_name"] == "OnlyFirst"

    def test_update_profile_unauthenticated(self, api_client):
        response = api_client.put(ME_URL, {"first_name": "Nope"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestChangePassword:
    def test_change_password_success(self, authenticated_client):
        response = authenticated_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "testpass123", "new_password": "NewStrong456!"},
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_change_password_wrong_current(self, authenticated_client):
        response = authenticated_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "wrongpassword", "new_password": "NewStrong456!"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_change_password_weak_new(self, authenticated_client):
        response = authenticated_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "testpass123", "new_password": "123"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_change_password_unauthenticated(self, api_client):
        response = api_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "x", "new_password": "y"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
```

**Step 3: Run tests**

Run: `docker compose exec backend pytest tests/test_accounts.py -v`

Expected: All tests pass.

**Step 4: Run full test suite to check nothing else broke**

Run: `docker compose exec backend pytest -v`

Expected: All tests pass. If any tests in other files reference email-based login or register, fix them.

**Step 5: Commit**

```bash
git add backend/tests/test_accounts.py backend/tests/factories.py
git commit -m "test(accounts): update tests for username login, profile update, change password"
```

---

### Task 5: Backend — Update Seed Data

**Files:**
- Check: `backend/*/management/commands/seed_data.py` (find and update)

**Step 1: Find the seed command**

Run: `grep -rl "seed" backend/*/management/commands/`

**Step 2: Update the seed command to create users with username instead of email-as-username**

The seed creates `admin@toony.dev / admin123`. Update it so `username="admin"` (or keep email as fallback). Check the actual file and adjust the `create_user` or `create_superuser` calls to pass `username` explicitly.

**Step 3: Test seed**

Run: `docker compose exec backend python manage.py seed_data` (or `make seed`)

**Step 4: Commit**

```bash
git add backend/
git commit -m "chore(accounts): update seed data for username-based auth"
```

---

### Task 6: Frontend — Update Types and API Module

**Files:**
- Modify: `frontend/types/auth.ts`
- Modify: `frontend/types/index.ts`
- Modify: `frontend/lib/api/auth.ts`
- Modify: `frontend/lib/api/index.ts`

**Step 1: Update auth types**

Replace `frontend/types/auth.ts` with:

```typescript
export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar: string;
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface UpdateProfilePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}
```

**Step 2: Update types/index.ts — remove RegisterCredentials export, add new types**

In `frontend/types/index.ts`, change the auth export block from:

```typescript
export type {
  User,
  AuthTokens,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
} from "./auth";
```

to:

```typescript
export type {
  User,
  AuthTokens,
  AuthResponse,
  LoginCredentials,
  UpdateProfilePayload,
  ChangePasswordPayload,
} from "./auth";
```

**Step 3: Update API module**

Replace `frontend/lib/api/auth.ts` with:

```typescript
import api from "@/lib/api";
import type {
  AuthResponse,
  ChangePasswordPayload,
  LoginCredentials,
  UpdateProfilePayload,
  User,
} from "@/types";

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login/", credentials);
  return data;
}

export async function refreshToken(refresh: string): Promise<{ access: string }> {
  const { data } = await api.post<{ access: string }>("/auth/refresh/", { refresh });
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me/");
  return data;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  const { data } = await api.put<User>("/auth/me/", payload);
  return data;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await api.post("/auth/me/change-password/", payload);
}
```

**Step 4: Update lib/api/index.ts — remove register export, add new exports**

In `frontend/lib/api/index.ts`, change line 1 from:

```typescript
export { login, register, refreshToken, getMe } from "./auth";
```

to:

```typescript
export { login, refreshToken, getMe, updateProfile, changePassword } from "./auth";
```

**Step 5: Commit**

```bash
git add frontend/types/auth.ts frontend/types/index.ts frontend/lib/api/auth.ts frontend/lib/api/index.ts
git commit -m "feat(frontend): update auth types and API for username login and profile"
```

---

### Task 7: Frontend — Update Auth Context and Remove Registration

**Files:**
- Modify: `frontend/contexts/auth-context.tsx`
- Delete: `frontend/app/(auth)/register/page.tsx`
- Modify: `frontend/middleware.ts`

**Step 1: Update auth context — remove register**

Replace `frontend/contexts/auth-context.tsx` with:

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User, LoginCredentials } from "@/types";
import { setTokens, clearTokens, getAccessToken, clearAuthCookie } from "@/lib/auth";
import * as authApi from "@/lib/api/auth";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshUser = useCallback(async () => {
    try {
      const user = await authApi.getMe();
      setState({ user, isLoading: false, isAuthenticated: true });
    } catch {
      clearTokens();
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      refreshUser();
    } else {
      clearAuthCookie();
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, [refreshUser]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const data = await authApi.login(credentials);
    setTokens({ access: data.access, refresh: data.refresh });
    setState({ user: data.user, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setState({ user: null, isLoading: false, isAuthenticated: false });
    window.location.href = "/login";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      refreshUser,
    }),
    [state, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

**Step 2: Delete register page**

Run: `rm frontend/app/\(auth\)/register/page.tsx`

**Step 3: Update middleware — remove /register from PUBLIC_ROUTES**

Replace `frontend/middleware.ts` with:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = request.cookies.get("toony_authenticated")?.value === "true";
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isHome = pathname === "/";

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && isPublicRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow public routes and home page
  if (isPublicRoute || isHome) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
```

**Step 4: Commit**

```bash
git add frontend/contexts/auth-context.tsx frontend/middleware.ts
git rm frontend/app/\(auth\)/register/page.tsx
git commit -m "feat(frontend): remove registration, update auth context for username login"
```

---

### Task 8: Frontend — Update Login Page

**Files:**
- Modify: `frontend/app/(auth)/login/page.tsx`

**Step 1: Update login page — username field, remove signup link**

Replace `frontend/app/(auth)/login/page.tsx` with:

```tsx
"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login({ username, password });
      router.push(redirect);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Invalid credentials. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Logomark */}
      <div className="mb-6 flex justify-center">
        <div className="h-9 w-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
          <div className="h-3 w-3 rounded-sm bg-indigo-500" />
        </div>
      </div>

      <h1 className="mb-6 text-center text-xl font-medium tracking-tight text-white">
        Sign in to Toony
      </h1>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-slate-400">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-400">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing in...
            </span>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/\(auth\)/login/page.tsx
git commit -m "feat(frontend): update login page to use username instead of email"
```

---

### Task 9: Frontend — Create Profile Page

**Files:**
- Create: `frontend/app/(dashboard)/profile/page.tsx`

**Step 1: Create the profile page**

Create `frontend/app/(dashboard)/profile/page.tsx`:

```tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { updateProfile, changePassword } from "@/lib/api/auth";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setEmail(user.email);
    }
  }, [user]);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setIsSavingProfile(true);

    try {
      await updateProfile({ first_name: firstName, last_name: lastName, email });
      await refreshUser();
      setProfileSuccess("Profile updated successfully.");
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setProfileError(Object.values(data).flat().join(" "));
      } else {
        setProfileError("Failed to update profile.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setIsSavingPassword(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setPasswordError(Object.values(data).flat().join(" "));
      } else {
        setPasswordError("Failed to change password.");
      }
    } finally {
      setIsSavingPassword(false);
    }
  }

  if (!user) return null;

  const inputClassName =
    "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold text-white">Profile</h1>

      {/* Personal Info */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-medium text-white">Personal Information</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400">Username</label>
          <p className="mt-1.5 text-sm text-slate-300">{user.username}</p>
        </div>

        {profileSuccess && (
          <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-sm text-green-400">
            {profileSuccess}
          </div>
        )}

        {profileError && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-slate-400">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-slate-400">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSavingProfile ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-medium text-white">Change Password</h2>

        {passwordSuccess && (
          <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-sm text-green-400">
            {passwordSuccess}
          </div>
        )}

        {passwordError && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-400">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-400">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-400">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingPassword}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSavingPassword ? "Changing..." : "Change password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/\(dashboard\)/profile/page.tsx
git commit -m "feat(frontend): add profile page with personal info and password change"
```

---

### Task 10: Final Verification

**Step 1: Run backend tests**

Run: `docker compose exec backend pytest -v`

Expected: All tests pass.

**Step 2: Build frontend**

Run: `docker compose exec frontend ./node_modules/.bin/next build`

Expected: Build succeeds with no TypeScript errors.

**Step 3: Run frontend lint**

Run: `make lint-frontend`

Expected: No lint errors.

**Step 4: Manual smoke test**

1. Start services: `make up`
2. Seed data: `make seed`
3. Visit `http://localhost:3000/login` — should show username + password fields, no signup link
4. Visit `http://localhost:3000/register` — should redirect to login (404 or redirect)
5. Login with seeded user credentials
6. Visit `http://localhost:3000/profile` — should show profile form with username (read-only), name, email, and password change
7. Update profile — should save and show success
8. Change password — should validate and show success

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
