import api from "@/lib/api";
import type {
  IssueList,
  IssueDetail,
  IssueComment,
  IssueActivity,
  IssueFilters,
  IssueStatus,
  IssuePriority,
  CrossProjectIssueList,
  CreateIssuePayload,
  UpdateIssuePayload,
  CreateCommentPayload,
  PaginatedResponse,
} from "@/types";

const base = (projectId: string) =>
  `/projects/${projectId}/issues`;

export async function listIssues(
  projectId: string,
  filters?: IssueFilters,
  cursor?: string
): Promise<PaginatedResponse<IssueList>> {
  const params = new URLSearchParams();
  if (cursor) params.append("cursor", cursor);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.assignee_id) params.append("assignee_id", filters.assignee_id);
  if (filters?.milestone_id) params.append("milestone_id", filters.milestone_id);
  if (filters?.cycle_id) params.append("cycle_id", filters.cycle_id);
  if (filters?.label_ids?.length) {
    filters.label_ids.forEach((id) => params.append("label_ids", id));
  }
  const qs = params.toString();
  const { data } = await api.get<PaginatedResponse<IssueList>>(
    `${base(projectId)}/${qs ? `?${qs}` : ""}`
  );
  return data;
}

export async function getIssue(
  projectId: string,
  issueId: string
): Promise<IssueDetail> {
  const { data } = await api.get<IssueDetail>(
    `${base(projectId)}/${issueId}/`
  );
  return data;
}

export async function createIssue(
  projectId: string,
  payload: CreateIssuePayload
): Promise<IssueDetail> {
  const { data } = await api.post<IssueDetail>(
    `${base(projectId)}/`,
    payload
  );
  return data;
}

export async function updateIssue(
  projectId: string,
  issueId: string,
  payload: UpdateIssuePayload
): Promise<IssueDetail> {
  const { data } = await api.put<IssueDetail>(
    `${base(projectId)}/${issueId}/`,
    payload
  );
  return data;
}

export async function deleteIssue(
  projectId: string,
  issueId: string
): Promise<void> {
  await api.delete(`${base(projectId)}/${issueId}/`);
}

export async function listComments(
  projectId: string,
  issueId: string,
  cursor?: string
): Promise<PaginatedResponse<IssueComment>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<IssueComment>>(
    `${base(projectId)}/${issueId}/comments/`,
    { params }
  );
  return data;
}

export async function createComment(
  projectId: string,
  issueId: string,
  payload: CreateCommentPayload
): Promise<IssueComment> {
  const { data } = await api.post<IssueComment>(
    `${base(projectId)}/${issueId}/comments/`,
    payload
  );
  return data;
}

export async function updateComment(
  projectId: string,
  issueId: string,
  commentId: string,
  payload: CreateCommentPayload
): Promise<IssueComment> {
  const { data } = await api.put<IssueComment>(
    `${base(projectId)}/${issueId}/comments/${commentId}/`,
    payload
  );
  return data;
}

export async function deleteComment(
  projectId: string,
  issueId: string,
  commentId: string
): Promise<void> {
  await api.delete(
    `${base(projectId)}/${issueId}/comments/${commentId}/`
  );
}

export async function listActivities(
  projectId: string,
  issueId: string,
  cursor?: string
): Promise<PaginatedResponse<IssueActivity>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<IssueActivity>>(
    `${base(projectId)}/${issueId}/activities/`,
    { params }
  );
  return data;
}

export async function listAllIssues(
  filters?: {
    status?: IssueStatus;
    priority?: IssuePriority;
    assignee_id?: string;
    project_id?: string;
    updated_after?: string;
  },
  cursor?: string
): Promise<PaginatedResponse<CrossProjectIssueList>> {
  const params = new URLSearchParams();
  if (cursor) params.append("cursor", cursor);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.assignee_id) params.append("assignee_id", filters.assignee_id);
  if (filters?.project_id) params.append("project_id", filters.project_id);
  if (filters?.updated_after) params.append("updated_after", filters.updated_after);
  const qs = params.toString();
  const { data } = await api.get<PaginatedResponse<CrossProjectIssueList>>(
    `/issues/${qs ? `?${qs}` : ""}`
  );
  return data;
}
