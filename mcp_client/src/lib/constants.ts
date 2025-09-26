// Session storage keys
export const SESSION_KEYS = {
  SERVER_URL: "mcp_server_url",
  CLIENT_INFORMATION: "mcp_client_information",
  PREREGISTERED_CLIENT_INFORMATION: "mcp_preregistered_client_information",
  TOKENS: "mcp_tokens",
  CODE_VERIFIER: "mcp_code_verifier",
  SERVER_METADATA: "mcp_server_metadata",
} as const;

// Generate server-specific session storage key
export const getServerSpecificKey = (baseKey: string, serverUrl: string): string => {
  const urlHash = btoa(serverUrl).replace(/[^a-zA-Z0-9]/g, '');
  return `${baseKey}_${urlHash}`;
};

// Connection status types
export type ConnectionStatus = 
  | "disconnected" 
  | "connecting" 
  | "connected" 
  | "error" 
  | "authenticating"
  | "error-connecting-to-proxy";
