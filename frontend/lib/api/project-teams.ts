import api from "@/lib/api";
import type { ProjectTeam, PaginatedResponse } from "@/types";

export async function listProjectTeams(
  projectId: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectTeam>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectTeam>>(
    `/projects/${projectId}/teams/`,
    { params }
  );
  return data;
}

export async function addProjectTeam(
  projectId: string,
  teamId: string
): Promise<ProjectTeam> {
  const { data } = await api.post<ProjectTeam>(
    `/projects/${projectId}/teams/`,
    { team_id: teamId }
  );
  return data;
}

export async function removeProjectTeam(
  projectId: string,
  teamId: string
): Promise<void> {
  await api.delete(
    `/projects/${projectId}/teams/${teamId}/`
  );
}
