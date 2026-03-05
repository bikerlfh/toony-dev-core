import api from "@/lib/api";
import type {
  IntegrationConfig,
  CreateIntegrationPayload,
  UpdateIntegrationPayload,
  PaginatedResponse,
} from "@/types";

export async function listIntegrations(
  orgId: string,
  cursor?: string
): Promise<PaginatedResponse<IntegrationConfig>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<IntegrationConfig>>(
    `/organizations/${orgId}/integrations/`,
    { params }
  );
  return data;
}

export async function createIntegration(
  orgId: string,
  payload: CreateIntegrationPayload
): Promise<IntegrationConfig> {
  const { data } = await api.post<IntegrationConfig>(
    `/organizations/${orgId}/integrations/`,
    payload
  );
  return data;
}

export async function getIntegration(
  orgId: string,
  integrationId: string
): Promise<IntegrationConfig> {
  const { data } = await api.get<IntegrationConfig>(
    `/organizations/${orgId}/integrations/${integrationId}/`
  );
  return data;
}

export async function updateIntegration(
  orgId: string,
  integrationId: string,
  payload: UpdateIntegrationPayload
): Promise<IntegrationConfig> {
  const { data } = await api.put<IntegrationConfig>(
    `/organizations/${orgId}/integrations/${integrationId}/`,
    payload
  );
  return data;
}

export async function deleteIntegration(
  orgId: string,
  integrationId: string
): Promise<void> {
  await api.delete(`/organizations/${orgId}/integrations/${integrationId}/`);
}
