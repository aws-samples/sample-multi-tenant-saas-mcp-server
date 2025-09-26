import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthClientInformationSchema,
  OAuthClientInformation,
  OAuthTokens,
  OAuthTokensSchema,
  OAuthClientMetadata,
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { 
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata 
} from "@modelcontextprotocol/sdk/client/auth.js";
import { SESSION_KEYS, getServerSpecificKey } from "./constants";
import { generateOAuthState } from "../utils/oauthUtils";

/**
 * Discovers OAuth scopes from server metadata, with preference for resource metadata scopes
 */
export const discoverScopes = async (
  serverUrl: string,
  resourceMetadata?: OAuthProtectedResourceMetadata,
  proxyUrl?: string,
): Promise<string | undefined> => {
  try {
    // Always use original server URL for OAuth discovery, not proxy URL
    const discoveryUrl = new URL("/", serverUrl);
    const metadata = await discoverAuthorizationServerMetadata(discoveryUrl);

    // Prefer resource metadata scopes, but fall back to OAuth metadata if empty
    const resourceScopes = resourceMetadata?.scopes_supported;
    const oauthScopes = metadata?.scopes_supported;

    const scopesSupported =
      resourceScopes && resourceScopes.length > 0
        ? resourceScopes
        : oauthScopes;

    // Be more conservative with scope requests
    if (scopesSupported && scopesSupported.length > 0) {
      // For MCP servers, try common scopes first
      const commonScopes = ['read', 'write', 'mcp', 'api'];
      const availableCommonScopes = scopesSupported.filter(scope => 
        commonScopes.includes(scope.toLowerCase())
      );
      
      if (availableCommonScopes.length > 0) {
        console.log("Using common scopes:", availableCommonScopes);
        return availableCommonScopes.join(" ");
      }
      
      // If no common scopes, try the first scope only (most conservative)
      console.log("Using first available scope:", scopesSupported[0]);
      return scopesSupported[0];
    }

    // If no scopes discovered, try without scope (some servers support this)
    console.log("No scopes discovered, attempting without scope parameter");
    return undefined;
  } catch (error) {
    console.debug("OAuth scope discovery failed:", error);
    return undefined;
  }
};

export const getClientInformationFromSessionStorage = async ({
  serverUrl,
  isPreregistered,
}: {
  serverUrl: string;
  isPreregistered?: boolean;
}) => {
  const key = getServerSpecificKey(
    isPreregistered
      ? SESSION_KEYS.PREREGISTERED_CLIENT_INFORMATION
      : SESSION_KEYS.CLIENT_INFORMATION,
    serverUrl,
  );

  const value = sessionStorage.getItem(key);
  if (!value) {
    return undefined;
  }

  return await OAuthClientInformationSchema.parseAsync(JSON.parse(value));
};

export const saveClientInformationToSessionStorage = ({
  serverUrl,
  clientInformation,
  isPreregistered,
}: {
  serverUrl: string;
  clientInformation: OAuthClientInformation;
  isPreregistered?: boolean;
}) => {
  const key = getServerSpecificKey(
    isPreregistered
      ? SESSION_KEYS.PREREGISTERED_CLIENT_INFORMATION
      : SESSION_KEYS.CLIENT_INFORMATION,
    serverUrl,
  );
  sessionStorage.setItem(key, JSON.stringify(clientInformation));
};

export const clearClientInformationFromSessionStorage = ({
  serverUrl,
  isPreregistered,
}: {
  serverUrl: string;
  isPreregistered?: boolean;
}) => {
  const key = getServerSpecificKey(
    isPreregistered
      ? SESSION_KEYS.PREREGISTERED_CLIENT_INFORMATION
      : SESSION_KEYS.CLIENT_INFORMATION,
    serverUrl,
  );
  sessionStorage.removeItem(key);
};

export class PlaygroundOAuthClientProvider implements OAuthClientProvider {
  constructor(
    protected serverUrl: string,
    scope?: string,
    protected proxyUrl?: string,
    protected preregisteredClientId?: string,
    protected preregisteredClientSecret?: string,
  ) {
    this.scope = scope;
    // Save the server URL to session storage
    sessionStorage.setItem(SESSION_KEYS.SERVER_URL, serverUrl);
  }
  scope: string | undefined;

  // Helper method to get the base URL for OAuth discovery
  private getOAuthBaseUrl(): string {
    // For OAuth discovery, we need to use the original server URL, not the proxy
    // The proxy is only for the main MCP transport connection
    return this.serverUrl;
  }

  get redirectUrl() {
    return window.location.origin + "/oauth/callback";
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "Amazon Bedrock MCP Playground",
      client_uri: "https://github.com/your-org/mcp-playground",
      scope: this.scope ?? "",
    };
  }

  state(): string | Promise<string> {
    return generateOAuthState();
  }

  async clientInformation() {
    // If pre-registered client credentials are provided, use them
    if (this.preregisteredClientId) {
      const clientInfo: any = {
        client_id: this.preregisteredClientId,
        redirect_uris: [this.redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: "Amazon Bedrock MCP Playground",
        client_uri: "https://github.com/your-org/mcp-playground",
        scope: this.scope ?? "",
      };
      
      // Add client_secret and auth method if provided
      if (this.preregisteredClientSecret) {
        clientInfo.client_secret = this.preregisteredClientSecret;
        clientInfo.token_endpoint_auth_method = "client_secret_post";
      } else {
        clientInfo.token_endpoint_auth_method = "none";
      }
      
      return clientInfo as OAuthClientInformation;
    }

    // Try to get the preregistered client information from session storage first
    const preregisteredClientInformation =
      await getClientInformationFromSessionStorage({
        serverUrl: this.serverUrl,
        isPreregistered: true,
      });

    // If no preregistered client information is found, get the dynamically registered client information
    return (
      preregisteredClientInformation ??
      (await getClientInformationFromSessionStorage({
        serverUrl: this.serverUrl,
        isPreregistered: false,
      }))
    );
  }

  saveClientInformation(clientInformation: OAuthClientInformation) {
    // For the playground, temporarily store the full client information including secret
    // This allows users to see and copy the credentials
    const playgroundKey = getServerSpecificKey("playground_client_info", this.serverUrl);
    sessionStorage.setItem(playgroundKey, JSON.stringify(clientInformation));
    
    // Remove client_secret before storing in the standard location (not needed after initial OAuth flow)
    const safeInfo = Object.fromEntries(
      Object.entries(clientInformation).filter(
        ([key]) => key !== "client_secret",
      ),
    ) as OAuthClientInformation;

    // Save the dynamically registered client information to session storage
    saveClientInformationToSessionStorage({
      serverUrl: this.serverUrl,
      clientInformation: safeInfo,
      isPreregistered: false,
    });
  }

  // Method to get full client information including secret for playground display
  async getPlaygroundClientInformation() {
    const playgroundKey = getServerSpecificKey("playground_client_info", this.serverUrl);
    const value = sessionStorage.getItem(playgroundKey);
    if (!value) {
      return undefined;
    }
    
    try {
      return await OAuthClientInformationSchema.parseAsync(JSON.parse(value));
    } catch {
      return undefined;
    }
  }

  async tokens() {
    const key = getServerSpecificKey(SESSION_KEYS.TOKENS, this.serverUrl);
    const tokens = sessionStorage.getItem(key);
    if (!tokens) {
      return undefined;
    }

    return await OAuthTokensSchema.parseAsync(JSON.parse(tokens));
  }

  saveTokens(tokens: OAuthTokens) {
    const key = getServerSpecificKey(SESSION_KEYS.TOKENS, this.serverUrl);
    sessionStorage.setItem(key, JSON.stringify(tokens));
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (
      authorizationUrl.protocol !== "http:" &&
      authorizationUrl.protocol !== "https:"
    ) {
      throw new Error("Authorization URL must be HTTP or HTTPS");
    }

    // Use a new tab instead of popup to avoid popup blockers
    // Store the current window reference for communication
    const originalWindow = window;
    
    // Open OAuth flow in a new tab
    const authTab = window.open(
      authorizationUrl.href,
      '_blank'
    );

    if (!authTab) {
      throw new Error("Failed to open OAuth tab. Please allow popups/new tabs for this site.");
    }

    // Wait for the tab to complete the OAuth flow
    return new Promise((resolve, reject) => {
      // Listen for messages from the OAuth tab
      const messageListener = (event: MessageEvent) => {
        console.log("Parent window received message:", event);
        console.log("Message origin:", event.origin);
        console.log("Expected origin:", window.location.origin);
        console.log("Message data:", event.data);
        
        if (event.origin !== window.location.origin) {
          console.log("Ignoring message from different origin");
          return; // Ignore messages from other origins
        }

        if (event.data.type === 'oauth_success') {
          console.log("Received OAuth success message");
          // Store the authorization code in the parent window's sessionStorage
          sessionStorage.setItem("oauth_authorization_code", event.data.code);
          if (event.data.state) {
            sessionStorage.setItem("oauth_state", event.data.state);
          }
          
          window.removeEventListener('message', messageListener);
          console.log("OAuth flow completed successfully");
          
          // Immediately attempt token exchange
          this.exchangeAuthorizationCodeForTokens(event.data.code)
            .then(() => resolve())
            .catch((error) => {
              console.error("Token exchange failed:", error);
              resolve(); // Still resolve to allow retry logic to handle it
            });
        } else if (event.data.type === 'oauth_error') {
          console.log("Received OAuth error message:", event.data.error);
          window.removeEventListener('message', messageListener);
          reject(new Error(event.data.error || "OAuth authentication failed"));
        }
      };

      window.addEventListener('message', messageListener);

      // Check periodically if the tab is closed manually
      const checkClosed = setInterval(() => {
        if (authTab.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageListener);
          
          // Check if we received the authorization code via postMessage
          const authCode = sessionStorage.getItem("oauth_authorization_code");
          if (authCode) {
            // Attempt token exchange for manually closed tab
            this.exchangeAuthorizationCodeForTokens(authCode)
              .then(() => resolve())
              .catch((error) => {
                console.error("Token exchange failed:", error);
                resolve(); // Still resolve to allow retry logic to handle it
              });
          } else {
            reject(new Error("OAuth flow was cancelled or failed"));
          }
        }
      }, 1000);

      // Timeout after 10 minutes (longer than popup since users might take more time in a tab)
      setTimeout(() => {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageListener);
        if (!authTab.closed) {
          // Don't force close the tab, just stop listening
          console.log("OAuth flow timed out, but leaving tab open for user");
        }
        reject(new Error("OAuth flow timed out"));
      }, 10 * 60 * 1000);
    });
  }

  async exchangeAuthorizationCodeForTokens(authorizationCode: string): Promise<void> {
    try {
      console.log("🔄 Starting token exchange...");
      
      // Get the authorization server metadata
      const protectedResourceMetadata = await discoverOAuthProtectedResourceMetadata(this.serverUrl);
      if (!protectedResourceMetadata.authorization_servers?.[0]) {
        throw new Error("No authorization server found");
      }

      const authServerUrl = protectedResourceMetadata.authorization_servers[0];
      const authServerMetadata = await discoverAuthorizationServerMetadata(authServerUrl);
      
      if (!authServerMetadata || !authServerMetadata.token_endpoint) {
        throw new Error("No token endpoint found");
      }

      // Prepare token exchange request
      const codeVerifier = this.codeVerifier();
      if (!codeVerifier) {
        throw new Error("No code verifier found");
      }

      // Get client information if available
      const clientInfo = await this.clientInformation();
      
      // Prepare token exchange request - completely manual to avoid code_verifier encoding
      const formParts: string[] = [
        `grant_type=${encodeURIComponent('authorization_code')}`,
        `code=${encodeURIComponent(authorizationCode)}`,
        `redirect_uri=${encodeURIComponent(this.redirectUrl)}`,
      ];

      // Add client_id if we have client information
      if (clientInfo?.client_id) {
        formParts.push(`client_id=${encodeURIComponent(clientInfo.client_id)}`);
      }

      // Add client_secret for pre-registered clients
      if ((clientInfo as any)?.client_secret) {
        formParts.push(`client_secret=${encodeURIComponent((clientInfo as any).client_secret)}`);
      }

      // Add code_verifier WITHOUT encoding - this is critical for AWS Cognito
      formParts.push(`code_verifier=${codeVerifier}`);

      const formBody = formParts.join('&');

      console.log("🔄 Token exchange request:", {
        endpoint: authServerMetadata.token_endpoint,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUrl,
        code_length: authorizationCode.length,
        code_verifier_length: codeVerifier.length,
        code_verifier_preview: `${codeVerifier.substring(0, 10)}...`,
        client_id: clientInfo?.client_id || 'none',
        has_client_secret: !!(clientInfo as any)?.client_secret,
        auth_method: (clientInfo as any)?.token_endpoint_auth_method || 'none',
      });

      // Make token exchange request directly to OAuth server (not through MCP proxy)
      const tokenEndpoint = authServerMetadata.token_endpoint;
      
      // OAuth token exchange must go directly to the OAuth server, not through any proxy
      const requestUrl = tokenEndpoint;

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: formBody,
      });

      console.log("🔄 Token exchange response:", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Token exchange failed:", errorText);
        console.error("Request details:", {
          url: requestUrl,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: formBody,
        });
        throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
      }

      const tokens = await response.json();
      console.log("🔄 Received tokens:", {
        access_token: tokens.access_token ? `${tokens.access_token.substring(0, 20)}...` : 'missing',
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        refresh_token: tokens.refresh_token ? 'present' : 'missing',
      });

      // Save tokens
      this.saveTokens(tokens);
      
      // Clear authorization code and code verifier
      sessionStorage.removeItem("oauth_authorization_code");
      sessionStorage.removeItem("oauth_state");
      const codeVerifierKey = getServerSpecificKey(SESSION_KEYS.CODE_VERIFIER, this.serverUrl);
      sessionStorage.removeItem(codeVerifierKey);
      
      console.log("✅ Token exchange completed successfully");
    } catch (error) {
      console.error("❌ Token exchange failed:", error);
      
      // Only clear authorization code on failure, keep code verifier for potential retries
      sessionStorage.removeItem("oauth_authorization_code");
      sessionStorage.removeItem("oauth_state");
      
      throw error;
    }
  }

  saveCodeVerifier(codeVerifier: string) {
    const key = getServerSpecificKey(
      SESSION_KEYS.CODE_VERIFIER,
      this.serverUrl,
    );
    sessionStorage.setItem(key, codeVerifier);
  }

  codeVerifier() {
    const key = getServerSpecificKey(
      SESSION_KEYS.CODE_VERIFIER,
      this.serverUrl,
    );
    const verifier = sessionStorage.getItem(key);
    if (!verifier) {
      throw new Error("No code verifier saved for session");
    }

    return verifier;
  }

  clear() {
    clearClientInformationFromSessionStorage({
      serverUrl: this.serverUrl,
      isPreregistered: false,
    });
    sessionStorage.removeItem(
      getServerSpecificKey(SESSION_KEYS.TOKENS, this.serverUrl),
    );
    sessionStorage.removeItem(
      getServerSpecificKey(SESSION_KEYS.CODE_VERIFIER, this.serverUrl),
    );
    // Clear playground client information
    sessionStorage.removeItem(
      getServerSpecificKey("playground_client_info", this.serverUrl),
    );
  }
}
