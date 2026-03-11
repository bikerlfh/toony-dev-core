export interface WorkflowNodeData {
  id: string;
  node_type: "SUBAGENT" | "SKILL";
  sub_agent: string | null;
  sub_agent_slug: string | null;
  skill: string | null;
  skill_slug: string | null;
  position_x: number;
  position_y: number;
  config_overrides: Record<string, unknown>;
  order: number;
}

export interface WorkflowEdgeData {
  id: string;
  source_node: string;
  target_node: string;
}

export interface WorkflowOrg {
  id: string;
  name: string;
}

export interface WorkflowProject {
  id: string;
  name: string;
}

export interface WorkflowLabel {
  id: string;
  name: string;
  color: string;
}

export interface WorkflowList {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  organization: WorkflowOrg | null;
  project: WorkflowProject | null;
  labels: WorkflowLabel[];
  nodes_count: number;
  created_at: string;
}

export interface WorkflowDetail extends WorkflowList {
  created_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
  nodes: WorkflowNodeData[];
  edges: WorkflowEdgeData[];
  updated_at: string;
}

export interface CreateWorkflowPayload {
  name: string;
  slug: string;
  description?: string;
  is_active?: boolean;
  organization?: string;
  project?: string;
  labels?: string[];
}

export interface UpdateWorkflowPayload {
  name?: string;
  description?: string;
  is_active?: boolean;
  organization?: string | null;
  project?: string | null;
  labels?: string[];
}

export interface CreateNodePayload {
  node_type: "SUBAGENT" | "SKILL";
  sub_agent?: string;
  skill?: string;
  position_x?: number;
  position_y?: number;
  config_overrides?: Record<string, unknown>;
  order?: number;
}

export interface UpdateNodePayload {
  position_x?: number;
  position_y?: number;
  config_overrides?: Record<string, unknown>;
  order?: number;
}

export interface CreateEdgePayload {
  source_node: string;
  target_node: string;
}
