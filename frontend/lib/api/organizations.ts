import api from "@/lib/api";
import type {
  Organization,
  OrganizationDetail,
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
} from "@/types";

export async function listOrganizations(): Promise<Organization[]> {
  const { data } = await api.get<Organization[]>("/organizations/");
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
