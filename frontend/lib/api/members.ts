import api from "@/lib/api";
import type { Member, AddMemberPayload, UpdateMemberRolePayload } from "@/types";

export async function listMembers(orgSlug: string): Promise<Member[]> {
  const { data } = await api.get<Member[]>(`/organizations/${orgSlug}/members/`);
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
