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
