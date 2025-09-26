import {
  OAuthMetadata,
  OAuthClientInformationFull,
  OAuthClientInformation,
  OAuthTokens,
  OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// OAuth flow steps
export type OAuthStep =
  | "metadata_discovery"
  | "client_registration"
  | "authorization_redirect"
  | "authorization_code"
  | "token_request"
  | "complete";

// Message types for inline feedback
export type MessageType = "success" | "error" | "info";

export interface StatusMessage {
  type: MessageType;
  message: string;
}

// Single state interface for OAuth state
export interface AuthState {
  isInitiatingAuth: boolean;
  oauthTokens: OAuthTokens | null;
  oauthStep: OAuthStep;
  resourceMetadata: OAuthProtectedResourceMetadata | null;
  resourceMetadataError: Error | null;
  resource: URL | null;
  authServerUrl: URL | null;
  oauthMetadata: OAuthMetadata | null;
  oauthClientInfo: OAuthClientInformationFull | OAuthClientInformation | null;
  authorizationUrl: string | null;
  authorizationCode: string;
  latestError: Error | null;
  statusMessage: StatusMessage | null;
  validationError: string | null;
}

export const EMPTY_AUTH_STATE: AuthState = {
  isInitiatingAuth: false,
  oauthTokens: null,
  oauthStep: "metadata_discovery",
  oauthMetadata: null,
  resourceMetadata: null,
  resourceMetadataError: null,
  resource: null,
  authServerUrl: null,
  oauthClientInfo: null,
  authorizationUrl: null,
  authorizationCode: "",
  latestError: null,
  statusMessage: null,
  validationError: null,
};

// Connection status
export type ConnectionStatus = 
  | "disconnected" 
  | "connecting" 
  | "connected" 
  | "error" 
  | "authenticating";

// MCP Connection state
export interface McpConnectionState {
  status: ConnectionStatus;
  serverUrl: string | null;
  authState: AuthState;
  tools: any[];
  resources: any[];
  prompts: any[];
  error: string | null;
}

export const EMPTY_MCP_CONNECTION_STATE: McpConnectionState = {
  status: "disconnected",
  serverUrl: null,
  authState: EMPTY_AUTH_STATE,
  tools: [],
  resources: [],
  prompts: [],
  error: null,
};
