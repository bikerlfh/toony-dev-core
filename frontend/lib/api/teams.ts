import api from "@/lib/api";
import type {
  Team,
  TeamDetail,
  TeamMember,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddTeamMemberPayload,
  UpdateTeamMemberRolePayload,
  PaginatedResponse,
} from "@/types";

export async function listTeams(
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<Team>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Team>>(
    `/organizations/${orgSlug}/teams/`,
    { params }
  );
  return data;
}

export async function createTeam(
  orgSlug: string,
  payload: CreateTeamPayload
): Promise<TeamDetail> {
  const { data } = await api.post<TeamDetail>(
    `/organizations/${orgSlug}/teams/`,
    payload
  );
  return data;
}

export async function getTeam(
  orgSlug: string,
  teamSlug: string
): Promise<TeamDetail> {
  const { data } = await api.get<TeamDetail>(
    `/organizations/${orgSlug}/teams/${teamSlug}/`
  );
  return data;
}

export async function updateTeam(
  orgSlug: string,
  teamSlug: string,
  payload: UpdateTeamPayload
): Promise<TeamDetail> {
  const { data } = await api.put<TeamDetail>(
    `/organizations/${orgSlug}/teams/${teamSlug}/`,
    payload
  );
  return data;
}

export async function deleteTeam(
  orgSlug: string,
  teamSlug: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/teams/${teamSlug}/`);
}

export async function listTeamMembers(
  orgSlug: string,
  teamSlug: string,
  cursor?: string
): Promise<PaginatedResponse<TeamMember>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<TeamMember>>(
    `/organizations/${orgSlug}/teams/${teamSlug}/members/`,
    { params }
  );
  return data;
}

export async function addTeamMember(
  orgSlug: string,
  teamSlug: string,
  payload: AddTeamMemberPayload
): Promise<TeamMember> {
  const { data } = await api.post<TeamMember>(
    `/organizations/${orgSlug}/teams/${teamSlug}/members/`,
    payload
  );
  return data;
}

export async function updateTeamMemberRole(
  orgSlug: string,
  teamSlug: string,
  userId: string,
  payload: UpdateTeamMemberRolePayload
): Promise<TeamMember> {
  const { data } = await api.put<TeamMember>(
    `/organizations/${orgSlug}/teams/${teamSlug}/members/${userId}/`,
    payload
  );
  return data;
}

export async function removeTeamMember(
  orgSlug: string,
  teamSlug: string,
  userId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgSlug}/teams/${teamSlug}/members/${userId}/`
  );
}
