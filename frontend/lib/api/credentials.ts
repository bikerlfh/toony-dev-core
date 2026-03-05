import api from "@/lib/api";
import type {
  RepositoryCredential,
  CreateCredentialPayload,
  UpdateCredentialPayload,
  PaginatedResponse,
} from "@/types";

export async function listCredentials(
  orgId: string,
  cursor?: string
): Promise<PaginatedResponse<RepositoryCredential>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<RepositoryCredential>>(
    `/organizations/${orgId}/credentials/`,
    { params }
  );
  return data;
}

export async function createCredential(
  orgId: string,
  payload: CreateCredentialPayload
): Promise<RepositoryCredential> {
  const { data } = await api.post<RepositoryCredential>(
    `/organizations/${orgId}/credentials/`,
    payload
  );
  return data;
}

export async function getCredential(
  orgId: string,
  credentialId: string
): Promise<RepositoryCredential> {
  const { data } = await api.get<RepositoryCredential>(
    `/organizations/${orgId}/credentials/${credentialId}/`
  );
  return data;
}

export async function updateCredential(
  orgId: string,
  credentialId: string,
  payload: UpdateCredentialPayload
): Promise<RepositoryCredential> {
  const { data } = await api.put<RepositoryCredential>(
    `/organizations/${orgId}/credentials/${credentialId}/`,
    payload
  );
  return data;
}

export async function deleteCredential(
  orgId: string,
  credentialId: string
): Promise<void> {
  await api.delete(`/organizations/${orgId}/credentials/${credentialId}/`);
}
