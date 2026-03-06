# Auth Refactor: Username Login, Remove Signup, Profile Page

**Date:** 2026-03-05

## Overview

Refactor authentication to use username+password instead of email+password, remove public registration (admin-only user creation via Django admin), and add a profile update page.

## Changes

### 1. Backend — User Model

- Change `USERNAME_FIELD` from `"email"` to `"username"` in User model
- Remove auto-set of `username = email` in `UserManager`
- `username` required and unique (already via AbstractUser), admin sets it manually
- `email` stays on the model but is no longer used for auth
- Migration for existing users: set `username` from current email value

### 2. Backend — Auth Endpoints

- **Login** (`POST /api/auth/login/`): Accept `username` + `password` instead of `email` + `password`. Update `authenticate_user()` service.
- **Register** (`POST /api/auth/register/`): Remove entirely — delete view, URL, service (`create_user`), input serializer (`RegisterUserSerializer`).
- **Me** (`GET /api/auth/me/`): No changes.
- **Refresh** (`POST /api/auth/refresh/`): No changes.

### 3. Backend — Profile Update Endpoints

- **`PUT /api/auth/me/`** — Update profile (first_name, last_name, email, avatar). Requires authentication. Reuses existing MeView path, adding PUT method.
- **`POST /api/auth/me/change-password/`** — Change password. Accepts `current_password` + `new_password`. Validates current password before updating. New view and URL.

### 4. Frontend — Login Page

- Replace email field with username field (text input, not email type)
- Update `LoginCredentials` type: `email` → `username`
- Update `login()` API call to send `username` + `password`

### 5. Frontend — Remove Registration

- Delete `frontend/app/(auth)/register/page.tsx`
- Remove `register()` from auth context, API module, and types (`RegisterCredentials`)
- Remove "Don't have an account? Sign up" link from login page
- Update middleware to stop treating `/register` as a public route

### 6. Frontend — Profile Page

- New route at `/profile` inside `(dashboard)` layout
- **Personal info form**: `first_name`, `last_name`, `email` (editable), `username` (read-only display)
- **Avatar**: display current, upload/URL update
- **Change password**: separate form with `current_password`, `new_password`, `confirm_password` (client-side confirm match)

## Out of Scope

- No frontend admin UI for user creation (Django admin only)
- No changes to JWT token flow, refresh logic, or WebSocket auth
