import api from "@/lib/api";
import type {
  ArtifactList,
  ArtifactDetail,
  CreateArtifactPayload,
  UpdateArtifactPayload,
  ArtifactType,
  ArtifactStatus,
} from "@/types/artifacts";
import type { PaginatedResponse } from "@/types";

// --- Nested under issue ---

const issueBase = (projectId: string, issueId: string) =>
  `/projects/${projectId}/issues/${issueId}/artifacts`;

export async function listIssueArtifacts(
  projectId: string,
  issueId: string,
  cursor?: string
): Promise<PaginatedResponse<ArtifactList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ArtifactList>>(
    `${issueBase(projectId, issueId)}/`,
    { params }
  );
  return data;
}

export async function createArtifact(
  projectId: string,
  issueId: string,
  payload: CreateArtifactPayload
): Promise<ArtifactDetail> {
  const { data } = await api.post<ArtifactDetail>(
    `${issueBase(projectId, issueId)}/`,
    payload
  );
  return data;
}

export async function getIssueArtifact(
  projectId: string,
  issueId: string,
  artifactId: string
): Promise<ArtifactDetail> {
  const { data } = await api.get<ArtifactDetail>(
    `${issueBase(projectId, issueId)}/${artifactId}/`
  );
  return data;
}

export async function updateIssueArtifact(
  projectId: string,
  issueId: string,
  artifactId: string,
  payload: UpdateArtifactPayload
): Promise<ArtifactDetail> {
  const { data } = await api.patch<ArtifactDetail>(
    `${issueBase(projectId, issueId)}/${artifactId}/`,
    payload
  );
  return data;
}

export async function deleteIssueArtifact(
  projectId: string,
  issueId: string,
  artifactId: string
): Promise<void> {
  await api.delete(`${issueBase(projectId, issueId)}/${artifactId}/`);
}

// --- Global ---

export async function listAllArtifacts(
  filters?: {
    artifact_type?: ArtifactType;
    status?: ArtifactStatus;
    issue_id?: string;
    agent_task_id?: string;
  },
  cursor?: string
): Promise<PaginatedResponse<ArtifactList>> {
  const params = new URLSearchParams();
  if (cursor) params.append("cursor", cursor);
  if (filters?.artifact_type) params.append("artifact_type", filters.artifact_type);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.issue_id) params.append("issue_id", filters.issue_id);
  if (filters?.agent_task_id) params.append("agent_task_id", filters.agent_task_id);
  const qs = params.toString();
  const { data } = await api.get<PaginatedResponse<ArtifactList>>(
    `/artifacts/${qs ? `?${qs}` : ""}`
  );
  return data;
}

export async function getArtifact(
  artifactId: string
): Promise<ArtifactDetail> {
  const { data } = await api.get<ArtifactDetail>(
    `/artifacts/${artifactId}/`
  );
  return data;
}

export async function updateGlobalArtifact(
  artifactId: string,
  payload: UpdateArtifactPayload
): Promise<ArtifactDetail> {
  const { data } = await api.patch<ArtifactDetail>(
    `/artifacts/${artifactId}/`,
    payload
  );
  return data;
}
