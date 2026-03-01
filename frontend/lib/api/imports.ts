import api from "@/lib/api";
import type {
  ImportJob,
  ImportJobDetail,
  ImportMapping,
  ExternalProject,
  ImportProvider,
  StartImportPayload,
  PaginatedResponse,
} from "@/types";

export async function listImportJobs(
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ImportJob>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ImportJob>>(
    `/organizations/${orgSlug}/imports/`,
    { params }
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
