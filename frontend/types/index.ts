import type { IssueList, ProjectList, Team, Label } from "./projects";

export type {
  User,
  AuthTokens,
  AuthResponse,
  LoginCredentials,
  UpdateProfilePayload,
  ChangePasswordPayload,
  UserAPIKey,
  UserAPIKeyCreated,
} from "./auth";

export type {
  Organization,
  OrganizationDetail,
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
  MembershipRole,
  Member,
  AddMemberPayload,
  UpdateMemberRolePayload,
} from "./organization";

export type {
  TeamRole,
  Team,
  TeamDetail,
  TeamMember,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddTeamMemberPayload,
  UpdateTeamMemberRolePayload,
  Label,
  CreateLabelPayload,
  UpdateLabelPayload,
  ProjectStatus,
  ProjectPriority,
  ProjectMemberRole,
  ProjectTeam,
  ProjectList,
  ProjectDetail,
  ProjectMember,
  ProjectSettings,
  CreateProjectPayload,
  UpdateProjectPayload,
  AddProjectMemberPayload,
  UpdateProjectMemberRolePayload,
  UpdateProjectSettingsPayload,
  MilestoneStatus,
  Milestone,
  CreateMilestonePayload,
  UpdateMilestonePayload,
  CycleStatus,
  Cycle,
  CreateCyclePayload,
  UpdateCyclePayload,
  IssueStatus,
  IssuePriority,
  IssueMilestoneMinimal,
  IssueCycleMinimal,
  IssueList,
  IssueDetail,
  CreateIssuePayload,
  UpdateIssuePayload,
  IssueFilters,
  IssueProject,
  CrossProjectIssueList,
  IssueComment,
  CreateCommentPayload,
  IssueActivity,
  ResourceType,
  ProjectResource,
  CreateProjectResourcePayload,
  UpdateProjectResourcePayload,
} from "./projects";

export type {
  CredentialProvider,
  CredentialType,
  IntegrationProvider,
  RepositoryCredential,
  CreateCredentialPayload,
  UpdateCredentialPayload,
  IntegrationConfig,
  CreateIntegrationPayload,
  UpdateIntegrationPayload,
} from "./credentials";

export type {
  SubAgentStatus,
  SubAgentType,
  SkillStatus,
  SkillCategory,
  SubAgentList,
  SubAgentDetail,
  CreateSubAgentPayload,
  UpdateSubAgentPayload,
  SkillList,
  SkillDetail,
  CreateSkillPayload,
  UpdateSkillPayload,
  SubAgentSkill,
  CreateSubAgentSkillPayload,
  UpdateSubAgentSkillPayload,
  SkillVersion,
} from "./agents";

export type {
  ImportJobStatus,
  ImportProvider,
  ImportJob,
  ImportJobDetail,
  ImportMapping,
  ExternalProject,
  StartImportPayload,
} from "./imports";

export type {
  ProjectWsEvent,
  IssueCreatedEvent,
  IssueUpdatedEvent,
  IssueDeletedEvent,
  CommentCreatedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
  SubAgentWsEvent,
  TaskAssignEvent,
  HeartbeatAckEvent,
  WsReadyState,
  NotificationCreatedEvent,
} from "./websocket";

export type { NotificationItem } from "./notifications";

export type {
  ToonyAgentStatus,
  AgentTaskStatus,
  TaskEventType,
  ToonyAgentList,
  ToonyAgentDetail,
  CreateToonyAgentPayload,
  UpdateToonyAgentPayload,
  ToonyAgentKeyItem,
  AgentTaskList,
  AgentTaskDetail,
  AgentTaskByIssueItem,
  CreateAgentTaskPayload,
  TaskEventItem,
  AgentSystemEventType,
  AgentSystemEventItem,
  ToonyAgentStatusWsEvent,
  TaskStatusWsEvent,
  TaskEventWsEvent,
  QuestionAskedWsEvent,
  ToolApprovalRequestWsEvent,
  ToonyAgentWsEvent,
} from "./toony-agents";

export type {
  ArtifactType,
  ArtifactStatus,
  ArtifactList,
  ArtifactDetail,
  CreateArtifactPayload,
  UpdateArtifactPayload,
} from "./artifacts";

export type { IssueDocument } from "./issue-documents";

export type {
  WorkflowNodeData,
  WorkflowEdgeData,
  WorkflowList,
  WorkflowDetail,
  CreateWorkflowPayload,
  UpdateWorkflowPayload,
  CreateNodePayload,
  UpdateNodePayload,
  CreateEdgePayload,
} from "./workflows";

// --- Pagination & Search ---

export interface PaginatedResponse<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface GlobalSearchResult {
  issues: IssueList[];
  projects: ProjectList[];
  teams: Team[];
  labels: Label[];
}
