import api from "@/lib/api";
import type {
  WorkflowList,
  WorkflowDetail,
  WorkflowNodeData,
  WorkflowEdgeData,
  CreateWorkflowPayload,
  UpdateWorkflowPayload,
  CreateNodePayload,
  UpdateNodePayload,
  CreateEdgePayload,
  PaginatedResponse,
} from "@/types";

export async function listWorkflows(
  cursor?: string
): Promise<PaginatedResponse<WorkflowList>> {
  const params = cursor ? { cursor } : {};
  const { data } = await api.get("/workflows/", { params });
  return data;
}

export async function getWorkflow(id: string): Promise<WorkflowDetail> {
  const { data } = await api.get(`/workflows/${id}/`);
  return data;
}

export async function createWorkflow(
  payload: CreateWorkflowPayload
): Promise<WorkflowDetail> {
  const { data } = await api.post("/workflows/", payload);
  return data;
}

export async function updateWorkflow(
  id: string,
  payload: UpdateWorkflowPayload
): Promise<WorkflowDetail> {
  const { data } = await api.patch(`/workflows/${id}/`, payload);
  return data;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await api.delete(`/workflows/${id}/`);
}

// Nodes
export async function listNodes(
  workflowId: string
): Promise<WorkflowNodeData[]> {
  const { data } = await api.get(`/workflows/${workflowId}/nodes/`);
  return data;
}

export async function createNode(
  workflowId: string,
  payload: CreateNodePayload
): Promise<WorkflowNodeData> {
  const { data } = await api.post(
    `/workflows/${workflowId}/nodes/`,
    payload
  );
  return data;
}

export async function updateNode(
  workflowId: string,
  nodeId: string,
  payload: UpdateNodePayload
): Promise<WorkflowNodeData> {
  const { data } = await api.patch(
    `/workflows/${workflowId}/nodes/${nodeId}/`,
    payload
  );
  return data;
}

export async function deleteNode(
  workflowId: string,
  nodeId: string
): Promise<void> {
  await api.delete(`/workflows/${workflowId}/nodes/${nodeId}/`);
}

// Edges
export async function listEdges(
  workflowId: string
): Promise<WorkflowEdgeData[]> {
  const { data } = await api.get(`/workflows/${workflowId}/edges/`);
  return data;
}

export async function createEdge(
  workflowId: string,
  payload: CreateEdgePayload
): Promise<WorkflowEdgeData> {
  const { data } = await api.post(
    `/workflows/${workflowId}/edges/`,
    payload
  );
  return data;
}

export async function deleteEdge(
  workflowId: string,
  edgeId: string
): Promise<void> {
  await api.delete(`/workflows/${workflowId}/edges/${edgeId}/`);
}
