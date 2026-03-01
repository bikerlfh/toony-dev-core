import api from "@/lib/api";
import type {
  RepositoryCredential,
  CreateCredentialPayload,
  UpdateCredentialPayload,
} from "@/types";

export async function listCredentials(
  orgSlug: string
): Promise<RepositoryCredential[]> {
  const { data } = await api.get<RepositoryCredential[]>(
    `/organizations/${orgSlug}/credentials/`
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
