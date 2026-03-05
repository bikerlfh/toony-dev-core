import api from "@/lib/api";
import type {
  Milestone,
  CreateMilestonePayload,
  UpdateMilestonePayload,
  PaginatedResponse,
} from "@/types";

const base = (projectId: string) =>
  `/projects/${projectId}/milestones`;

export async function listMilestones(
  projectId: string,
  cursor?: string
): Promise<PaginatedResponse<Milestone>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Milestone>>(
    `${base(projectId)}/`,
    { params }
  );
  return data;
}

export async function createMilestone(
  projectId: string,
  payload: CreateMilestonePayload
): Promise<Milestone> {
  const { data } = await api.post<Milestone>(
    `${base(projectId)}/`,
    payload
  );
  return data;
}

export async function getMilestone(
  projectId: string,
  milestoneId: string
): Promise<Milestone> {
  const { data } = await api.get<Milestone>(
    `${base(projectId)}/${milestoneId}/`
  );
  return data;
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  payload: UpdateMilestonePayload
): Promise<Milestone> {
  const { data } = await api.put<Milestone>(
    `${base(projectId)}/${milestoneId}/`,
    payload
  );
  return data;
}

export async function deleteMilestone(
  projectId: string,
  milestoneId: string
): Promise<void> {
  await api.delete(`${base(projectId)}/${milestoneId}/`);
}
