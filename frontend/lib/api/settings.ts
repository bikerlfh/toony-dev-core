import api from "@/lib/api";
import type { OrganizationSettings, UpdateOrganizationSettingsPayload } from "@/types";

export async function getOrganizationSettings(
  orgId: string
): Promise<OrganizationSettings> {
  const { data } = await api.get<OrganizationSettings>(
    `/organizations/${orgId}/settings/`
  );
  return data;
}

export async function updateOrganizationSettings(
  orgId: string,
  payload: UpdateOrganizationSettingsPayload
): Promise<OrganizationSettings> {
  const { data } = await api.patch<OrganizationSettings>(
    `/organizations/${orgId}/settings/`,
    payload
  );
  return data;
}
