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

export async function getOrganization(slug: string): Promise<OrganizationDetail> {
  const { data } = await api.get<OrganizationDetail>(`/organizations/${slug}/`);
  return data;
}

export async function updateOrganization(
  slug: string,
  payload: UpdateOrganizationPayload
): Promise<OrganizationDetail> {
  const { data } = await api.patch<OrganizationDetail>(
    `/organizations/${slug}/`,
    payload
  );
  return data;
}

export async function deleteOrganization(slug: string): Promise<void> {
  await api.delete(`/organizations/${slug}/`);
}
