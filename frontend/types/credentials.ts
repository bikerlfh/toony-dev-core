export type CredentialProvider = "GITHUB" | "GITLAB" | "BITBUCKET" | "CUSTOM";
export type CredentialType = "TOKEN" | "SSH_KEY" | "APP_CREDENTIAL";
export type IntegrationProvider = "LINEAR" | "JIRA" | "TRELLO" | "SLACK" | "CUSTOM";

export interface RepositoryCredential {
  id: string;
  name: string;
  provider: CredentialProvider;
  credential_type: CredentialType;
  url_pattern: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCredentialPayload {
  name: string;
  provider: CredentialProvider;
  credential_type: CredentialType;
  encrypted_value: string;
  url_pattern?: string;
}

export interface UpdateCredentialPayload {
  name?: string;
  provider?: CredentialProvider;
  credential_type?: CredentialType;
  encrypted_value?: string;
  url_pattern?: string;
  is_active?: boolean;
}

export interface IntegrationConfig {
  id: string;
  provider: IntegrationProvider;
  webhook_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIntegrationPayload {
  provider: IntegrationProvider;
  encrypted_credentials: string;
  webhook_url?: string;
}

export interface UpdateIntegrationPayload {
  provider?: IntegrationProvider;
  encrypted_credentials?: string;
  webhook_url?: string;
  is_active?: boolean;
}
