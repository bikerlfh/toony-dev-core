import api from "@/lib/api";
import type {
  ProjectResource,
  CreateProjectResourcePayload,
  UpdateProjectResourcePayload,
  PaginatedResponse,
} from "@/types";

const base = (projectId: string) =>
  `/projects/${projectId}/resources`;

export async function listResources(
  projectId: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectResource>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectResource>>(
    `${base(projectId)}/`,
    { params }
  );
  return data;
}

export async function createResource(
  projectId: string,
  payload: CreateProjectResourcePayload
): Promise<ProjectResource> {
  const { data } = await api.post<ProjectResource>(
    `${base(projectId)}/`,
    payload
  );
  return data;
}

export async function updateResource(
  projectId: string,
  resourceId: string,
  payload: UpdateProjectResourcePayload
): Promise<ProjectResource> {
  const { data } = await api.put<ProjectResource>(
    `${base(projectId)}/${resourceId}/`,
    payload
  );
  return data;
}

export async function deleteResource(
  projectId: string,
  resourceId: string
): Promise<void> {
  await api.delete(`${base(projectId)}/${resourceId}/`);
}
