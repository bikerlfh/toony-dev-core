import api from "@/lib/api";
import type { ProjectTeam, PaginatedResponse } from "@/types";

export async function listProjectTeams(
  orgSlug: string,
  projectSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectTeam>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectTeam>>(
    `/organizations/${orgSlug}/projects/${projectSlug}/teams/`,
    { params }
  );
  return data;
}

export async function addProjectTeam(
  orgSlug: string,
  projectSlug: string,
  teamId: string
): Promise<ProjectTeam> {
  const { data } = await api.post<ProjectTeam>(
    `/organizations/${orgSlug}/projects/${projectSlug}/teams/`,
    { team_id: teamId }
  );
  return data;
}

export async function removeProjectTeam(
  orgSlug: string,
  projectSlug: string,
  teamId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgSlug}/projects/${projectSlug}/teams/${teamId}/`
  );
}
