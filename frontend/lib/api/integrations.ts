import api from "@/lib/api";
import type {
  IntegrationConfig,
  CreateIntegrationPayload,
  UpdateIntegrationPayload,
} from "@/types";

export async function listIntegrations(
  orgSlug: string
): Promise<IntegrationConfig[]> {
  const { data } = await api.get<IntegrationConfig[]>(
    `/organizations/${orgSlug}/integrations/`
  );
  return data;
}

export async function createIntegration(
  orgSlug: string,
  payload: CreateIntegrationPayload
): Promise<IntegrationConfig> {
  const { data } = await api.post<IntegrationConfig>(
    `/organizations/${orgSlug}/integrations/`,
    payload
  );
  return data;
}

export async function getIntegration(
  orgSlug: string,
  integrationId: string
): Promise<IntegrationConfig> {
  const { data } = await api.get<IntegrationConfig>(
    `/organizations/${orgSlug}/integrations/${integrationId}/`
  );
  return data;
}

export async function updateIntegration(
  orgSlug: string,
  integrationId: string,
  payload: UpdateIntegrationPayload
): Promise<IntegrationConfig> {
  const { data } = await api.put<IntegrationConfig>(
    `/organizations/${orgSlug}/integrations/${integrationId}/`,
    payload
  );
  return data;
}

export async function deleteIntegration(
  orgSlug: string,
  integrationId: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/integrations/${integrationId}/`);
}
