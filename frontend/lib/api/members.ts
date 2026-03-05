import api from "@/lib/api";
import type { Member, AddMemberPayload, UpdateMemberRolePayload, PaginatedResponse } from "@/types";

export async function listMembers(
  orgId: string,
  cursor?: string
): Promise<PaginatedResponse<Member>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Member>>(
    `/organizations/${orgId}/members/`,
    { params }
  );
  return data;
}

export async function addMember(
  orgId: string,
  payload: AddMemberPayload
): Promise<Member> {
  const { data } = await api.post<Member>(
    `/organizations/${orgId}/members/`,
    payload
  );
  return data;
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  payload: UpdateMemberRolePayload
): Promise<Member> {
  const { data } = await api.patch<Member>(
    `/organizations/${orgId}/members/${userId}/`,
    payload
  );
  return data;
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  await api.delete(`/organizations/${orgId}/members/${userId}/`);
}
