import api from "@/lib/api";
import type {
  ProjectResource,
  CreateProjectResourcePayload,
  UpdateProjectResourcePayload,
  PaginatedResponse,
} from "@/types";

const base = (orgSlug: string, projectSlug: string) =>
  `/organizations/${orgSlug}/projects/${projectSlug}/resources`;

export async function listResources(
  orgSlug: string,
  projectSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ProjectResource>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ProjectResource>>(
    `${base(orgSlug, projectSlug)}/`,
    { params }
  );
  return data;
}

export async function createResource(
  orgSlug: string,
  projectSlug: string,
  payload: CreateProjectResourcePayload
): Promise<ProjectResource> {
  const { data } = await api.post<ProjectResource>(
    `${base(orgSlug, projectSlug)}/`,
    payload
  );
  return data;
}

export async function updateResource(
  orgSlug: string,
  projectSlug: string,
  resourceId: string,
  payload: UpdateProjectResourcePayload
): Promise<ProjectResource> {
  const { data } = await api.put<ProjectResource>(
    `${base(orgSlug, projectSlug)}/${resourceId}/`,
    payload
  );
  return data;
}

export async function deleteResource(
  orgSlug: string,
  projectSlug: string,
  resourceId: string
): Promise<void> {
  await api.delete(`${base(orgSlug, projectSlug)}/${resourceId}/`);
}
