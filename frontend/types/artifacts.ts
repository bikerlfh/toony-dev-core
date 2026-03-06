import type { AgentTaskStatus } from "./toony-agents";

export type ArtifactType = "PLAN" | "DESIGN_DOC" | "TECHNICAL_SPEC" | "TEST_PLAN" | "OTHER";

export type ArtifactStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "SUPERSEDED";

export interface ArtifactList {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  status: ArtifactStatus;
  requires_approval: boolean;
  issue_id: string;
  agent_task_id: string;
  created_at: string;
}

export interface ArtifactDetail extends ArtifactList {
  content: string;
  session_id: string;
  issue: { id: string; identifier: string; title: string };
  agent_task: { id: string; title: string; status: AgentTaskStatus };
  updated_at: string;
}

export interface CreateArtifactPayload {
  title: string;
  artifact_type: ArtifactType;
  content: string;
  session_id: string;
  agent_task_id: string;
  requires_approval?: boolean;
}

export interface UpdateArtifactPayload {
  title?: string;
  content?: string;
  status?: ArtifactStatus;
  requires_approval?: boolean;
}
