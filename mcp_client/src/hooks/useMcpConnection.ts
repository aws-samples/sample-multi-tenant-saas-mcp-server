import { useState, useEffect, useCallback } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
  ListResourcesRequestSchema,
  ListResourcesResultSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
  CallToolResultSchema,
  ReadResourceRequestSchema,
  ReadResourceResultSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema,
  Tool,
  Resource,
  Prompt,
} from "@modelcontextprotocol/sdk/types.js";
import {
  auth,
  discoverOAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { PlaygroundOAuthClientProvider, discoverScopes } from "../lib/auth";
import { ConnectionStatus } from "../lib/constants";
import { z } from "zod";
import { McpConnectionState, EMPTY_MCP_CONNECTION_STATE } from "../lib/auth-types";
import { getMcpProxyUrl, getApiBaseUrl } from "../lib/config";

interface UseMcpConnectionOptions {
  serverUrl?: string;
  bearerToken?: string;
  headerName?: string;
  clientId?: string;
  clientSecret?: string;
  onError?: (error: Error) => void;
}

export function useMcpConnection({
  serverUrl,
  bearerToken,
  headerName,
  clientId,
  clientSecret,
  onError,
}: UseMcpConnectionOptions = {}) {
  const [state, setState] = useState<McpConnectionState>(EMPTY_MCP_CONNECTION_STATE);
  const [client, setClient] = useState<Client | null>(null);

  const updateState = useCallback((updates: Partial<McpConnectionState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error("MCP Connection Error:", error);
    updateState({ 
      status: "error", 
      error: error.message 
    });
    onError?.(error);
  }, [onError, updateState]);

  const is401Error = (error: unknown): boolean => {
    return (
      (error instanceof Error && error.message.includes("401")) ||
      (error instanceof Error && error.message.includes("Unauthorized")) ||
      (error instanceof Error && error.message.includes("Authentication failed"))
    );
  };

  const handleAuthError = async (error: unknown, url: string, retryWithoutScope: boolean = false) => {
    if (is401Error(error)) {
      // If we have a manual bearer token, don't try OAuth - just fail fast
      if (bearerToken) {
        console.log("🔍 401 error with manual bearer token - failing immediately");
        return false;
      }
      
      updateState({ status: "authenticating" });
      
      // Declare variables at function scope for access in catch blocks
      let authCode: string | null = null;
      let serverAuthProvider: PlaygroundOAuthClientProvider | null = null;
      
      try {
        console.log("Starting OAuth flow for:", url);
        
        let scope = undefined;
        const proxyUrl = getMcpProxyUrl(url);
        
        if (!retryWithoutScope) {
          // First attempt: discover scopes normally using original server URL
          let resourceMetadata;
          try {
            resourceMetadata = await discoverOAuthProtectedResourceMetadata(
              new URL("/", url), // Use original server URL for OAuth discovery
            );
          } catch {
            // Resource metadata is optional, continue without it
          }
          scope = await discoverScopes(url, resourceMetadata, proxyUrl);
        } else {
          // Retry attempt: try without any scope
          console.log("Retrying OAuth without scope parameter");
          scope = undefined;
        }
        
        console.log("Using scope:", scope);
        
        // Check sessionStorage before auth
        authCode = sessionStorage.getItem("oauth_authorization_code");
        
        serverAuthProvider = new PlaygroundOAuthClientProvider(
          url, 
          scope, 
          proxyUrl,
          clientId,
          clientSecret
        );
        
        // Check if we already have valid tokens from a previous OAuth flow
        const existingTokens = await serverAuthProvider.tokens();
        
        if (existingTokens?.access_token) {
          return true; // We have tokens, so consider auth successful
        }

        // If we have an authorization code but no tokens, try to exchange it manually
        if (authCode && !existingTokens) {
          try {
            await serverAuthProvider.exchangeAuthorizationCodeForTokens(authCode);
            const tokensAfterExchange = await serverAuthProvider.tokens();
            if (tokensAfterExchange?.access_token) {
              console.log("✅ Manual token exchange successful");
              return true;
            }
          } catch (exchangeError) {
            console.error("❌ Manual token exchange failed:", exchangeError);
          }
        }

        const result = await auth(serverAuthProvider, {
          serverUrl: url,
          scope,
        });
        
        console.log("🔍 Auth result:", result);
        console.log("🔍 Auth result === 'AUTHORIZED':", result === "AUTHORIZED");
        
        // Check sessionStorage after auth
        console.log("🔍 SessionStorage after auth:");
        const tokens = await serverAuthProvider.tokens();
        console.log("  Tokens available:", !!tokens);
        console.log("  Access token:", tokens?.access_token ? "present" : "missing");
        
        return result === "AUTHORIZED";
      } catch (authError) {
        console.error("OAuth flow failed:", authError);
        
        // If tab is blocked but we have an authorization code, try to continue
        if (authError instanceof Error && 
            authError.message.includes("Failed to open OAuth tab") && 
            authCode && serverAuthProvider) {
          console.log("🔍 Tab blocked but authorization code exists, attempting to continue...");
          
          // Check if tokens were created despite the tab error
          const tokensAfterError = await serverAuthProvider.tokens();
          if (tokensAfterError?.access_token) {
            console.log("🔍 Tokens found after tab error, considering auth successful");
            return true;
          }
        }
        
        // Clear authorization code if auth failed to prevent confusion
        sessionStorage.removeItem("oauth_authorization_code");
        sessionStorage.removeItem("oauth_state");
        
        // Check if it's an invalid_scope error and we haven't retried yet
        if (!retryWithoutScope && 
            authError instanceof Error && 
            (authError.message.includes("invalid_scope") || authError.message.includes("invalid_request"))) {
          console.log("Got invalid_scope error, retrying without scope");
          return await handleAuthError(error, url, true);
        }
        
        handleError(new Error(`Authentication failed: ${authError instanceof Error ? authError.message : String(authError)}`));
        return false;
      }
    }
    return false;
  };

  const loadServerData = async (mcpClient: Client) => {
    try {
      // Load tools
      const toolsResponse = await mcpClient.request(
        { method: "tools/list" },
        ListToolsResultSchema
      );
      
      // Load resources
      const resourcesResponse = await mcpClient.request(
        { method: "resources/list" },
        ListResourcesResultSchema
      );
      
      // Load prompts
      const promptsResponse = await mcpClient.request(
        { method: "prompts/list" },
        ListPromptsResultSchema
      );

      // Attach callTool method to each tool - capture mcpClient in closure
      const toolsWithCallTool = (toolsResponse.tools || []).map((tool: any) => ({
        ...tool,
        callTool: async (args: any) => {
          try {
            const response = await mcpClient.request({
              method: "tools/call",
              params: {
                name: tool.name,
                arguments: args || {},
              },
            }, CallToolResultSchema);
            
            return response;
          } catch (error) {
            console.error("Tool call error:", error);
            throw error;
          }
        }
      }));

      // Attach readResource method to each resource - capture mcpClient in closure
      const resourcesWithReadResource = (resourcesResponse.resources || []).map((resource: any) => ({
        ...resource,
        readResource: async () => {
          try {
            const response = await mcpClient.request({
              method: "resources/read",
              params: {
                uri: resource.uri,
              },
            }, ReadResourceResultSchema);
            
            return response;
          } catch (error) {
            console.error("Error reading resource:", error);
            throw error;
          }
        },
      }));

      // Attach getPrompt method to each prompt - capture mcpClient in closure
      const promptsWithGetPrompt = (promptsResponse.prompts || []).map((prompt: any) => ({
        ...prompt,
        getPrompt: async (args: any = {}) => {
          try {
            const response = await mcpClient.request({
              method: "prompts/get",
              params: {
                name: prompt.name,
                arguments: args,
              },
            }, GetPromptResultSchema);
            
            return response;
          } catch (error) {
            console.error("Error getting prompt:", error);
            throw error;
          }
        },
      }));

      updateState({
        tools: toolsWithCallTool,
        resources: resourcesWithReadResource,
        prompts: promptsWithGetPrompt,
      });
    } catch (error) {
      console.warn("Failed to load server data:", error);
      // Don't treat this as a fatal error
    }
  };

  const connect = async (url: string, retryCount: number = 0) => {
    if (!url) return;

    updateState({ 
      status: "connecting", 
      serverUrl: url, 
      error: null 
    });

    try {
      // Create MCP client - exactly like Inspector
      const mcpClient = new Client(
        {
          name: "mcp-playground",
          version: "1.0.0",
        },
        {
          capabilities: {
            sampling: {},
          },
        },
      );

      // Prepare headers - exactly like Inspector
      const headers: HeadersInit = {};
      
      // Create proxy URL first
      const proxyUrl = getMcpProxyUrl(url);
      
      // Discover scope for auth provider consistency - use original server URL for OAuth discovery
      let scope = undefined;
      if (!bearerToken) {
        // Only do OAuth discovery if no manual bearer token is provided
        try {
          const resourceMetadata = await discoverOAuthProtectedResourceMetadata(
            new URL("/", url), // Use original server URL, not proxy URL
          );
          scope = await discoverScopes(url, resourceMetadata, proxyUrl);
        } catch {
          // Resource metadata is optional, continue without it
        }
      }
      
      // Create auth provider with discovered scope (consistent with OAuth flow)
      const serverAuthProvider = new PlaygroundOAuthClientProvider(
        url, 
        scope, 
        proxyUrl,
        clientId,
        clientSecret
      );
      
      // Use manually provided bearer token if available, otherwise use OAuth tokens - exactly like Inspector
      let token: string | undefined;
      if (bearerToken) {
        // Manual bearer token provided - use it directly, skip OAuth
        token = bearerToken;
        console.log("🔍 Token Debug:");
        console.log("  Using manual bearer token");
        console.log("  Token length:", token.length);
      } else {
        // No manual token - try OAuth
        token = (await serverAuthProvider.tokens())?.access_token;
      }
      
      if (token) {
        const authHeaderName = headerName || "Authorization";
        if (authHeaderName.toLowerCase() !== "authorization") {
          headers[authHeaderName] = token;
          headers["x-custom-auth-header"] = authHeaderName;
        } else {
          headers[authHeaderName] = `Bearer ${token}`;
        }
      }

      // Create transport using our proxy - environment-aware URL
      const transportOptions: StreamableHTTPClientTransportOptions = {
        // Only include authProvider if we're NOT using manual bearer token
        ...(bearerToken ? {} : { authProvider: serverAuthProvider }),
        requestInit: {
          headers,
        },
        reconnectionOptions: {
          maxReconnectionDelay: 5000,  // Reduced from 30000 to 5000 (5 seconds max)
          initialReconnectionDelay: 500,  // Reduced from 1000 to 500 (0.5 seconds initial)
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 3,  // Keep retries but with faster timeouts
        },
      };

      const transport = new StreamableHTTPClientTransport(
        new URL(proxyUrl, window.location.origin),
        transportOptions
      );

      console.log("🔍 Transport created with URL:", proxyUrl);
      console.log("🔍 Transport options:", transportOptions);

      // Connect - exactly like Inspector
      console.log("🔍 Attempting to connect...");
      await mcpClient.connect(transport);
      
      console.log("🔍 Connection established successfully!");
      console.log("🔍 Server capabilities:", mcpClient.getServerCapabilities());
      
      setClient(mcpClient);
      updateState({ status: "connected" });

      // Load server data
      await loadServerData(mcpClient);

    } catch (error) {
      console.error("Connection failed:", error);
      
      // Handle auth errors - exactly like Inspector
      const shouldRetry = await handleAuthError(error, url);
      
      if (shouldRetry) {
        return connect(url, retryCount + 1);
      }
      
      // If it's a 401 error but auth failed, don't set error state (user might be redirected)
      // UNLESS we're using a manual bearer token, in which case we should show the error
      if (is401Error(error)) {
        if (bearerToken) {
          // Manual bearer token failed - show the error
          handleError(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      
      // For other errors, show them
      handleError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const disconnect = useCallback(async () => {
    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.warn("Error closing client:", error);
      }
      setClient(null);
    }
    setState(EMPTY_MCP_CONNECTION_STATE);
  }, [client]);

  const callTool = useCallback(async (name: string, args: any = {}) => {
    if (!client) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await client.request({
        method: "tools/call",
        params: {
          name: name,
          arguments: args || {},
        },
      }, CallToolResultSchema);
      
      return response;
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, [client, handleError]);

  const readResource = useCallback(async (uri: string) => {
    if (!client) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await client.request({
        method: "resources/read",
        params: {
          uri,
        },
      }, ReadResourceResultSchema);
      
      return response;
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, [client, handleError]);

  const getPrompt = useCallback(async (name: string, args: any = {}) => {
    if (!client) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await client.request({
        method: "prompts/get",
        params: {
          name,
          arguments: args,
        },
      }, GetPromptResultSchema);
      
      return response;
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, [client, handleError]);

  // Auto-connect when serverUrl changes
  useEffect(() => {
    if (serverUrl && state.status === "disconnected") {
      connect(serverUrl);
    }
  }, [serverUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (client) {
        client.close().catch(console.warn);
      }
    };
  }, [client]);

  return {
    ...state,
    connect: (url: string) => connect(url),
    disconnect,
    callTool,
    readResource,
    getPrompt,
    isConnected: state.status === "connected",
    isConnecting: state.status === "connecting",
    isAuthenticating: state.status === "authenticating",
  };
}
