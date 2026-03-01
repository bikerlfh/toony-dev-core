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
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectList>>(
    `/organizations/${orgSlug}/projects/`,
    { params }
  );
  return data;
}

export async function createProject(
  orgSlug: string,
  payload: CreateProjectPayload
): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>(
    `/organizations/${orgSlug}/projects/`,
    payload
  );
  return data;
}

export async function getProject(
  orgSlug: string,
  projectSlug: string
): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(
    `/organizations/${orgSlug}/projects/${projectSlug}/`
  );
  return data;
}

export async function updateProject(
  orgSlug: string,
  projectSlug: string,
  payload: UpdateProjectPayload
): Promise<ProjectDetail> {
  const { data } = await api.put<ProjectDetail>(
    `/organizations/${orgSlug}/projects/${projectSlug}/`,
    payload
  );
  return data;
}

export async function deleteProject(
  orgSlug: string,
  projectSlug: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/projects/${projectSlug}/`);
}

export async function listProjectMembers(
  orgSlug: string,
  projectSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectMember>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectMember>>(
    `/organizations/${orgSlug}/projects/${projectSlug}/members/`,
    { params }
  );
  return data;
}

export async function addProjectMember(
  orgSlug: string,
  projectSlug: string,
  payload: AddProjectMemberPayload
): Promise<ProjectMember> {
  const { data } = await api.post<ProjectMember>(
    `/organizations/${orgSlug}/projects/${projectSlug}/members/`,
    payload
  );
  return data;
}

export async function updateProjectMemberRole(
  orgSlug: string,
  projectSlug: string,
  userId: string,
  payload: UpdateProjectMemberRolePayload
): Promise<ProjectMember> {
  const { data } = await api.put<ProjectMember>(
    `/organizations/${orgSlug}/projects/${projectSlug}/members/${userId}/`,
    payload
  );
  return data;
}

export async function removeProjectMember(
  orgSlug: string,
  projectSlug: string,
  userId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgSlug}/projects/${projectSlug}/members/${userId}/`
  );
}

export async function getProjectSettings(
  orgSlug: string,
  projectSlug: string
): Promise<ProjectSettings> {
  const { data } = await api.get<ProjectSettings>(
    `/organizations/${orgSlug}/projects/${projectSlug}/settings/`
  );
  return data;
}

export async function updateProjectSettings(
  orgSlug: string,
  projectSlug: string,
  payload: UpdateProjectSettingsPayload
): Promise<ProjectSettings> {
  const { data } = await api.put<ProjectSettings>(
    `/organizations/${orgSlug}/projects/${projectSlug}/settings/`,
    payload
  );
  return data;
}
