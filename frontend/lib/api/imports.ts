import api from "@/lib/api";
import type {
  ImportJob,
  ImportJobDetail,
  ImportMapping,
  ExternalProject,
  ImportProvider,
  StartImportPayload,
} from "@/types";

export async function listImportJobs(
  orgSlug: string
): Promise<ImportJob[]> {
  const { data } = await api.get<ImportJob[]>(
    `/organizations/${orgSlug}/imports/`
  );
  return data;
}

export async function startImport(
  orgSlug: string,
  payload: StartImportPayload
): Promise<ImportJobDetail> {
  const { data } = await api.post<ImportJobDetail>(
    `/organizations/${orgSlug}/imports/`,
    payload
  );
  return data;
}

export async function getImportJob(
  orgSlug: string,
  jobId: string
): Promise<ImportJobDetail> {
  const { data } = await api.get<ImportJobDetail>(
    `/organizations/${orgSlug}/imports/${jobId}/`
  );
  return data;
}

export async function getImportMappings(
  orgSlug: string,
  jobId: string
): Promise<ImportMapping[]> {
  const { data } = await api.get<ImportMapping[]>(
    `/organizations/${orgSlug}/imports/${jobId}/mappings/`
  );
  return data;
}

export async function listExternalProjects(
  orgSlug: string,
  provider: ImportProvider
): Promise<ExternalProject[]> {
  const { data } = await api.post<ExternalProject[]>(
    `/organizations/${orgSlug}/imports/external-projects/`,
    { provider }
  );
  return data;
}
