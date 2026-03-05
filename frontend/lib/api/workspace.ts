import api from "@/lib/api";
import type {
  Team,
  TeamDetail,
  TeamMember,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddTeamMemberPayload,
  UpdateTeamMemberRolePayload,
  Label,
  CreateLabelPayload,
  UpdateLabelPayload,
  PaginatedResponse,
} from "@/types";

// --- Labels ---

export async function listLabels(
  cursor?: string
): Promise<PaginatedResponse<Label>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Label>>(
    `/workspace/labels/`,
    { params }
  );
  return data;
}

export async function createLabel(
  payload: CreateLabelPayload
): Promise<Label> {
  const { data } = await api.post<Label>(`/workspace/labels/`, payload);
  return data;
}

export async function updateLabel(
  labelId: string,
  payload: UpdateLabelPayload
): Promise<Label> {
  const { data } = await api.put<Label>(
    `/workspace/labels/${labelId}/`,
    payload
  );
  return data;
}

export async function deleteLabel(labelId: string): Promise<void> {
  await api.delete(`/workspace/labels/${labelId}/`);
}

// --- Teams ---

export async function listTeams(
  cursor?: string
): Promise<PaginatedResponse<Team>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Team>>(
    `/workspace/teams/`,
    { params }
  );
  return data;
}

export async function createTeam(
  payload: CreateTeamPayload
): Promise<TeamDetail> {
  const { data } = await api.post<TeamDetail>(`/workspace/teams/`, payload);
  return data;
}

export async function getTeam(teamId: string): Promise<TeamDetail> {
  const { data } = await api.get<TeamDetail>(
    `/workspace/teams/${teamId}/`
  );
  return data;
}

export async function updateTeam(
  teamId: string,
  payload: UpdateTeamPayload
): Promise<TeamDetail> {
  const { data } = await api.put<TeamDetail>(
    `/workspace/teams/${teamId}/`,
    payload
  );
  return data;
}

export async function deleteTeam(teamId: string): Promise<void> {
  await api.delete(`/workspace/teams/${teamId}/`);
}

export async function listTeamMembers(
  teamId: string,
  cursor?: string
): Promise<PaginatedResponse<TeamMember>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<TeamMember>>(
    `/workspace/teams/${teamId}/members/`,
    { params }
  );
  return data;
}

export async function addTeamMember(
  teamId: string,
  payload: AddTeamMemberPayload
): Promise<TeamMember> {
  const { data } = await api.post<TeamMember>(
    `/workspace/teams/${teamId}/members/`,
    payload
  );
  return data;
}

export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  payload: UpdateTeamMemberRolePayload
): Promise<TeamMember> {
  const { data } = await api.put<TeamMember>(
    `/workspace/teams/${teamId}/members/${userId}/`,
    payload
  );
  return data;
}

export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<void> {
  await api.delete(`/workspace/teams/${teamId}/members/${userId}/`);
}
