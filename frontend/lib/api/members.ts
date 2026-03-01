import api from "@/lib/api";
import type { Member, AddMemberPayload, UpdateMemberRolePayload, PaginatedResponse } from "@/types";

export async function listMembers(
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<Member>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Member>>(
    `/organizations/${orgSlug}/members/`,
    { params }
  );
  return data;
}

export async function addMember(
  orgSlug: string,
  payload: AddMemberPayload
): Promise<Member> {
  const { data } = await api.post<Member>(
    `/organizations/${orgSlug}/members/`,
    payload
  );
  return data;
}

export async function updateMemberRole(
  orgSlug: string,
  userId: string,
  payload: UpdateMemberRolePayload
): Promise<Member> {
  const { data } = await api.patch<Member>(
    `/organizations/${orgSlug}/members/${userId}/`,
    payload
  );
  return data;
}

export async function removeMember(orgSlug: string, userId: string): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/members/${userId}/`);
}
