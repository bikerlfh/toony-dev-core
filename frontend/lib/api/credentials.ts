import api from "@/lib/api";
import type {
  RepositoryCredential,
  CreateCredentialPayload,
  UpdateCredentialPayload,
  PaginatedResponse,
} from "@/types";

export async function listCredentials(
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<RepositoryCredential>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<RepositoryCredential>>(
    `/organizations/${orgSlug}/credentials/`,
    { params }
  );
  return data;
}

export async function createCredential(
  orgSlug: string,
  payload: CreateCredentialPayload
): Promise<RepositoryCredential> {
  const { data } = await api.post<RepositoryCredential>(
    `/organizations/${orgSlug}/credentials/`,
    payload
  );
  return data;
}

export async function getCredential(
  orgSlug: string,
  credentialId: string
): Promise<RepositoryCredential> {
  const { data } = await api.get<RepositoryCredential>(
    `/organizations/${orgSlug}/credentials/${credentialId}/`
  );
  return data;
}

export async function updateCredential(
  orgSlug: string,
  credentialId: string,
  payload: UpdateCredentialPayload
): Promise<RepositoryCredential> {
  const { data } = await api.put<RepositoryCredential>(
    `/organizations/${orgSlug}/credentials/${credentialId}/`,
    payload
  );
  return data;
}

export async function deleteCredential(
  orgSlug: string,
  credentialId: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/credentials/${credentialId}/`);
}
