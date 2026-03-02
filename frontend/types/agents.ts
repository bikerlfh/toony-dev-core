export type AgentStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "DEPRECATED";
export type AgentType = "CODER" | "REVIEWER" | "TESTER" | "PLANNER" | "CUSTOM";
export type SkillStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "DEPRECATED";
export type SkillCategory =
  | "CODING"
  | "TESTING"
  | "REVIEW"
  | "DOCUMENTATION"
  | "DEPLOYMENT"
  | "CUSTOM";

export interface AgentList {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  status: AgentStatus;
  agent_type: AgentType;
  version: string;
  is_external: boolean;
  created_at: string;
}

export interface AgentDetail {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  description: string;
  markdown: string;
  version: string;
  status: AgentStatus;
  agent_type: AgentType;
  capabilities: string[];
  is_external: boolean;
  external_command: string;
  created_by: { id: string; email: string; first_name: string; last_name: string } | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateAgentPayload {
  name: string;
  slug: string;
  organization?: string | null;
  description?: string;
  markdown?: string;
  version?: string;
  status?: AgentStatus;
  agent_type?: AgentType;
  capabilities?: string[];
  is_external?: boolean;
  external_command?: string;
  tags?: string[];
}

export interface UpdateAgentPayload {
  name?: string;
  description?: string;
  markdown?: string;
  version?: string;
  status?: AgentStatus;
  agent_type?: AgentType;
  capabilities?: string[];
  is_external?: boolean;
  external_command?: string;
  tags?: string[];
  assigned_projects?: string[];
}

export interface SkillList {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  status: SkillStatus;
  category: SkillCategory;
  version: string;
  is_external: boolean;
  created_at: string;
}

export interface SkillDetail {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  description: string;
  version: string;
  status: SkillStatus;
  markdown: string;
  category: SkillCategory;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  compatible_agent_types: string[];
  is_external: boolean;
  external_command: string;
  created_by: { id: string; email: string; first_name: string; last_name: string } | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateSkillPayload {
  name: string;
  slug: string;
  organization?: string | null;
  description?: string;
  version?: string;
  status?: SkillStatus;
  markdown?: string;
  category?: SkillCategory;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  compatible_agent_types?: string[];
  is_external?: boolean;
  external_command?: string;
  tags?: string[];
}

export interface UpdateSkillPayload {
  name?: string;
  description?: string;
  version?: string;
  status?: SkillStatus;
  markdown?: string;
  category?: SkillCategory;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  compatible_agent_types?: string[];
  is_external?: boolean;
  external_command?: string;
  tags?: string[];
  changelog?: string;
}

export interface AgentSkill {
  id: string;
  skill: SkillList;
  priority: number;
  is_enabled: boolean;
  custom_config: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateAgentSkillPayload {
  skill: string;
  priority?: number;
  custom_config?: Record<string, unknown> | null;
}

export interface UpdateAgentSkillPayload {
  priority?: number;
  is_enabled?: boolean;
  custom_config?: Record<string, unknown> | null;
}

export interface SkillVersion {
  id: string;
  version: string;
  content: string;
  changelog: string;
  created_by: { id: string; email: string; first_name: string; last_name: string } | null;
  created_at: string;
}
