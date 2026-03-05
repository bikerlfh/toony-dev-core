import api from "@/lib/api";
import type { Cycle, CreateCyclePayload, UpdateCyclePayload, PaginatedResponse } from "@/types";

const base = (projectId: string) =>
  `/projects/${projectId}/cycles`;

export async function listCycles(
  projectId: string,
  cursor?: string
): Promise<PaginatedResponse<Cycle>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<Cycle>>(
    `${base(projectId)}/`,
    { params }
  );
  return data;
}

export async function createCycle(
  projectId: string,
  payload: CreateCyclePayload
): Promise<Cycle> {
  const { data } = await api.post<Cycle>(
    `${base(projectId)}/`,
    payload
  );
  return data;
}

export async function getCycle(
  projectId: string,
  cycleId: string
): Promise<Cycle> {
  const { data } = await api.get<Cycle>(
    `${base(projectId)}/${cycleId}/`
  );
  return data;
}

export async function updateCycle(
  projectId: string,
  cycleId: string,
  payload: UpdateCyclePayload
): Promise<Cycle> {
  const { data } = await api.put<Cycle>(
    `${base(projectId)}/${cycleId}/`,
    payload
  );
  return data;
}

export async function deleteCycle(
  projectId: string,
  cycleId: string
): Promise<void> {
  await api.delete(`${base(projectId)}/${cycleId}/`);
}
