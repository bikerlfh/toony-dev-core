import api from "@/lib/api";
import type {
  Organization,
  OrganizationDetail,
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
  PaginatedResponse,
} from "@/types";

export async function listOrganizations(
  cursor?: string
): Promise<PaginatedResponse<Organization>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Organization>>(
    "/organizations/",
    { params }
  );
  return data;
}

export async function createOrganization(
  payload: CreateOrganizationPayload
): Promise<OrganizationDetail> {
  const { data } = await api.post<OrganizationDetail>("/organizations/", payload);
  return data;
}

export async function getOrganization(id: string): Promise<OrganizationDetail> {
  const { data } = await api.get<OrganizationDetail>(`/organizations/${id}/`);
  return data;
}

export async function updateOrganization(
  id: string,
  payload: UpdateOrganizationPayload
): Promise<OrganizationDetail> {
  const { data } = await api.patch<OrganizationDetail>(
    `/organizations/${id}/`,
    payload
  );
  return data;
}

export async function deleteOrganization(id: string): Promise<void> {
  await api.delete(`/organizations/${id}/`);
}
