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
  orgId: string,
  cursor?: string
): Promise<PaginatedResponse<ImportJob>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ImportJob>>(
    `/organizations/${orgId}/imports/`,
    { params }
  );
  return data;
}

export async function startImport(
  orgId: string,
  payload: StartImportPayload
): Promise<ImportJobDetail> {
  const { data } = await api.post<ImportJobDetail>(
    `/organizations/${orgId}/imports/`,
    payload
  );
  return data;
}

export async function getImportJob(
  orgId: string,
  jobId: string
): Promise<ImportJobDetail> {
  const { data } = await api.get<ImportJobDetail>(
    `/organizations/${orgId}/imports/${jobId}/`
  );
  return data;
}

export async function getImportMappings(
  orgId: string,
  jobId: string
): Promise<ImportMapping[]> {
  const { data } = await api.get<ImportMapping[]>(
    `/organizations/${orgId}/imports/${jobId}/mappings/`
  );
  return data;
}

export async function listExternalProjects(
  orgId: string,
  provider: ImportProvider
): Promise<ExternalProject[]> {
  const { data } = await api.post<ExternalProject[]>(
    `/organizations/${orgId}/imports/external-projects/`,
    { provider }
  );
  return data;
}
