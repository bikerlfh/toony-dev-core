import api from "@/lib/api";
import type { OrganizationSettings, UpdateOrganizationSettingsPayload } from "@/types";

export async function getOrganizationSettings(
  orgSlug: string
): Promise<OrganizationSettings> {
  const { data } = await api.get<OrganizationSettings>(
    `/organizations/${orgSlug}/settings/`
  );
  return data;
}

export async function updateOrganizationSettings(
  orgSlug: string,
  payload: UpdateOrganizationSettingsPayload
): Promise<OrganizationSettings> {
  const { data } = await api.patch<OrganizationSettings>(
    `/organizations/${orgSlug}/settings/`,
    payload
  );
  return data;
}
