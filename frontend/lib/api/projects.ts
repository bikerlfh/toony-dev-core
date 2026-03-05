import api from "@/lib/api";
import type {
  ProjectList,
  ProjectDetail,
  ProjectMember,
  ProjectSettings,
  CreateProjectPayload,
  UpdateProjectPayload,
  AddProjectMemberPayload,
  UpdateProjectMemberRolePayload,
  UpdateProjectSettingsPayload,
  PaginatedResponse,
} from "@/types";

export async function listProjects(
  cursor?: string
): Promise<PaginatedResponse<ProjectList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectList>>(
    "/projects/",
    { params }
  );
  return data;
}

export async function createProject(
  payload: CreateProjectPayload
): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>(
    "/projects/",
    payload
  );
  return data;
}

export async function getProject(
  projectId: string
): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(
    `/projects/${projectId}/`
  );
  return data;
}

export async function updateProject(
  projectId: string,
  payload: UpdateProjectPayload
): Promise<ProjectDetail> {
  const { data } = await api.put<ProjectDetail>(
    `/projects/${projectId}/`,
    payload
  );
  return data;
}

export async function deleteProject(
  projectId: string
): Promise<void> {
  await api.delete(`/projects/${projectId}/`);
}

export async function listProjectMembers(
  projectId: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectMember>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectMember>>(
    `/projects/${projectId}/members/`,
    { params }
  );
  return data;
}

export async function addProjectMember(
  projectId: string,
  payload: AddProjectMemberPayload
): Promise<ProjectMember> {
  const { data } = await api.post<ProjectMember>(
    `/projects/${projectId}/members/`,
    payload
  );
  return data;
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  payload: UpdateProjectMemberRolePayload
): Promise<ProjectMember> {
  const { data } = await api.put<ProjectMember>(
    `/projects/${projectId}/members/${userId}/`,
    payload
  );
  return data;
}

export async function removeProjectMember(
  projectId: string,
  userId: string
): Promise<void> {
  await api.delete(
    `/projects/${projectId}/members/${userId}/`
  );
}

export async function getProjectSettings(
  projectId: string
): Promise<ProjectSettings> {
  const { data } = await api.get<ProjectSettings>(
    `/projects/${projectId}/settings/`
  );
  return data;
}

export async function updateProjectSettings(
  projectId: string,
  payload: UpdateProjectSettingsPayload
): Promise<ProjectSettings> {
  const { data } = await api.put<ProjectSettings>(
    `/projects/${projectId}/settings/`,
    payload
  );
  return data;
}
