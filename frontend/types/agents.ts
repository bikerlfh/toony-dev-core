export type SubAgentStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "DEPRECATED";
export type SubAgentType = "CODER" | "REVIEWER" | "TESTER" | "PLANNER" | "CUSTOM";
export type SkillStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "DEPRECATED";
export type SkillCategory =
  | "CODING"
  | "TESTING"
  | "REVIEW"
  | "DOCUMENTATION"
  | "DEPLOYMENT"
  | "CUSTOM";

export interface SubAgentList {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  description: string;
  status: SubAgentStatus;
  agent_type: SubAgentType;
  version: string;
  is_external: boolean;
  created_at: string;
}

export interface SubAgentDetail {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  description: string;
  markdown: string;
  version: string;
  status: SubAgentStatus;
  agent_type: SubAgentType;
  capabilities: string[];
  is_external: boolean;
  external_command: string;
  created_by: { id: string; email: string; first_name: string; last_name: string } | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateSubAgentPayload {
  name: string;
  slug: string;
  organization?: string | null;
  description?: string;
  markdown?: string;
  version?: string;
  status?: SubAgentStatus;
  agent_type?: SubAgentType;
  capabilities?: string[];
  is_external?: boolean;
  external_command?: string;
  tags?: string[];
}

export interface UpdateSubAgentPayload {
  name?: string;
  description?: string;
  markdown?: string;
  version?: string;
  status?: SubAgentStatus;
  agent_type?: SubAgentType;
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
  description: string;
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

export interface SubAgentSkill {
  id: string;
  skill: SkillList;
  priority: number;
  is_enabled: boolean;
  custom_config: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateSubAgentSkillPayload {
  skill: string;
  priority?: number;
  custom_config?: Record<string, unknown> | null;
}

export interface UpdateSubAgentSkillPayload {
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
