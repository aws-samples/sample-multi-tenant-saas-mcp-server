import React, { useState } from "react";
import { useMcpConnection } from "./hooks/useMcpConnection";
import { PlaygroundOAuthClientProvider } from "./lib/auth";

interface McpServersProps {
  onToolsUpdate: (tools: any[]) => void;
  onResourcesUpdate: (resources: any[]) => void;
  onPromptsUpdate: (prompts: any[]) => void;
}

export default function McpServers({ onToolsUpdate, onResourcesUpdate, onPromptsUpdate }: McpServersProps) {
  const [serverUrl, setServerUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [transportType, setTransportType] = useState<"auto" | "http" | "sse">("auto");
  const [usePreregisteredClient, setUsePreregisteredClient] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [useManualAuth, setUseManualAuth] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);

  const {
    status,
    tools,
    resources,
    prompts,
    error,
    connect,
    disconnect,
    callTool,
    isConnected,
    isConnecting,
    isAuthenticating,
  } = useMcpConnection({
    bearerToken: bearerToken || undefined,
    headerName: headerName || undefined,
    clientId: usePreregisteredClient ? clientId : undefined,
    clientSecret: usePreregisteredClient ? clientSecret : undefined,
    onError: (error) => {
      console.error("MCP Connection Error:", error);
    },
  });

  // Update parent component when tools change
  React.useEffect(() => {
    if (tools.length > 0) {
      onToolsUpdate(tools);
    }
  }, [tools, onToolsUpdate]);

  // Update parent component when resources change
  React.useEffect(() => {
    if (resources.length > 0) {
      onResourcesUpdate(resources);
    }
  }, [resources, onResourcesUpdate]);

  // Update parent component when prompts change
  React.useEffect(() => {
    if (prompts.length > 0) {
      onPromptsUpdate(prompts);
    }
  }, [prompts, onPromptsUpdate]);

  // Update bearer token and client credentials after successful OAuth authentication
  React.useEffect(() => {
    const updateCredentialsFromOAuth = async () => {
      if (isConnected && serverUrl) {
        try {
          console.log("🔍 Updating credentials from OAuth:", {
            usePreregisteredClient,
            useManualAuth,
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
            hasBearerToken: !!bearerToken
          });

          // Import getMcpProxyUrl to get the proxy URL
          const { getMcpProxyUrl } = await import("./lib/config");
          const proxyUrl = getMcpProxyUrl(serverUrl);
          const authProvider = new PlaygroundOAuthClientProvider(
            serverUrl, 
            undefined, 
            proxyUrl,
            usePreregisteredClient ? clientId : undefined,
            usePreregisteredClient ? clientSecret : undefined
          );
          
          // Always update bearer token when available (regardless of auth method)
          if (!bearerToken) {
            const tokens = await authProvider.tokens();
            if (tokens?.access_token) {
              setBearerToken(tokens.access_token);
              setCurrentToken(tokens.access_token);
              console.log("Bearer token populated from OAuth");
            }
          }
          
          // Auto-populate client credentials if:
          // 1. We're NOT using pre-registered client (user didn't manually select it)
          // 2. We don't already have credentials (to avoid overwriting)
          // 3. This is from an automatic OAuth flow (for display purposes)
          if (!usePreregisteredClient && (!clientId || !clientSecret)) {
            
            // Try to get the full client information including secret from playground storage
            const playgroundClientInfo = await authProvider.getPlaygroundClientInformation();
            
            if (playgroundClientInfo) {
              if (playgroundClientInfo.client_id && !clientId) {
                setClientId(playgroundClientInfo.client_id);
              }
              if ((playgroundClientInfo as any)?.client_secret && !clientSecret) {
                setClientSecret((playgroundClientInfo as any).client_secret);
              }
            } else {
              // Fallback to standard client information (without secret)
              const clientInfo = await authProvider.clientInformation();
              
              if (clientInfo?.client_id && !clientId) {
                setClientId(clientInfo.client_id);
              }
            }
          }
        } catch (error) {
          console.debug("No OAuth credentials available:", error);
        }
      }
    };

    updateCredentialsFromOAuth();
  }, [isConnected, serverUrl, bearerToken, usePreregisteredClient, clientId, clientSecret]);

  const handleConnect = () => {
    if (serverUrl.trim()) {
      // Auto-hide Manual Authentication if checked but no token provided
      if (useManualAuth && !bearerToken.trim()) {
        setUseManualAuth(false);
      }
      
      connect(serverUrl.trim());
    }
  };

  const handleDisconnect = () => {
    disconnect();
    // Keep the server URL so users can easily reconnect
    // setServerUrl(""); // Commented out to preserve server URL
    setBearerToken("");
    setHeaderName("");
    setUsePreregisteredClient(false);
    setClientId("");
    setClientSecret("");
    setUseManualAuth(false);
    setCurrentToken(null);
    setShowBearerToken(false);
    setShowClientSecret(false);
  };

  const handleCopyClientId = async () => {
    if (clientId) {
      try {
        await navigator.clipboard.writeText(clientId);
        console.log("Client ID copied to clipboard");
      } catch (error) {
        console.error("Failed to copy client ID:", error);
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = clientId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
    }
  };

  const handleCopyClientSecret = async () => {
    if (clientSecret) {
      try {
        await navigator.clipboard.writeText(clientSecret);
        console.log("Client Secret copied to clipboard");
      } catch (error) {
        console.error("Failed to copy client secret:", error);
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = clientSecret;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
    }
  };

  const handleCopyToken = async () => {
    if (currentToken) {
      try {
        await navigator.clipboard.writeText(currentToken);
        // You could add a toast notification here if desired
        console.log("Token copied to clipboard");
      } catch (error) {
        console.error("Failed to copy token:", error);
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = currentToken;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "connected": return "text-green-600";
      case "connecting": return "text-yellow-600";
      case "authenticating": return "text-aws-orange";
      case "error": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "connected": return "Connected";
      case "connecting": return "Connecting...";
      case "authenticating": return "Authenticating...";
      case "error": return `Error: ${error}`;
      default: return "Disconnected";
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-xl font-semibold mb-2">MCP Servers</h2>
      <p className="text-sm text-gray-600 mb-4">SSE and streamable HTTP transports supported</p>
      
      {/* Connection Form */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Server URL
          </label>
          <input
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://mcp-server.example.com/mcp"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-aws-orange"
            disabled={isConnected}
          />
        </div>

        {/* Authentication Method Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Authentication Method
          </label>
          
          {/* Option 1: No Authentication (OAuth Flow) */}
          <div className="space-y-4">
            <div className="flex items-start">
              <input
                type="radio"
                id="authNone"
                name="authMethod"
                checked={!useManualAuth && !usePreregisteredClient}
                onChange={() => {
                  // Only clear manually entered values, not auto-populated ones
                  if (useManualAuth) {
                    setBearerToken("");
                    setHeaderName("");
                    setCurrentToken(null);
                    setShowBearerToken(false);
                  }
                  if (usePreregisteredClient) {
                    setClientId("");
                    setClientSecret("");
                    setShowClientSecret(false);
                  }
                  setUseManualAuth(false);
                  setUsePreregisteredClient(false);
                }}
                className="mt-1 mr-3"
                disabled={isConnected}
              />
              <div className="flex-1">
                <label htmlFor="authNone" className={`text-sm font-medium ${isConnected ? 'text-gray-400' : 'text-gray-700'}`}>
                  OAuth Flow (Automatic)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Let the app handle authentication automatically through OAuth
                </p>
              </div>
            </div>

            {/* Option 2: Pre-registered OAuth Client */}
            <div className="flex items-start">
              <input
                type="radio"
                id="authOAuthClient"
                name="authMethod"
                checked={usePreregisteredClient}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUsePreregisteredClient(checked);
                  if (checked) {
                    setUseManualAuth(false);
                    // Clear manual auth fields only if manually entered
                    if (!isConnected) {
                      setBearerToken("");
                      setHeaderName("");
                      setCurrentToken(null);
                      setShowBearerToken(false);
                    }
                  }
                }}
                className="mt-1 mr-3"
                disabled={isConnected}
              />
              <div className="flex-1">
                <label htmlFor="authOAuthClient" className={`text-sm font-medium ${isConnected ? 'text-gray-400' : 'text-gray-700'}`}>
                  Pre-registered OAuth Client
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Use existing OAuth client credentials for authentication
                </p>
              </div>
            </div>

            {/* Option 3: Manual Bearer Token */}
            <div className="flex items-start">
              <input
                type="radio"
                id="authManual"
                name="authMethod"
                checked={useManualAuth}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUseManualAuth(checked);
                  if (checked) {
                    setUsePreregisteredClient(false);
                    // Clear OAuth client fields only if manually entered
                    if (!isConnected) {
                      setClientId("");
                      setClientSecret("");
                      setShowClientSecret(false);
                    }
                  }
                }}
                className="mt-1 mr-3"
                disabled={isConnected}
              />
              <div className="flex-1">
                <label htmlFor="authManual" className={`text-sm font-medium ${isConnected ? 'text-gray-400' : 'text-gray-700'}`}>
                  Manual Bearer Token
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Provide your own bearer token for authentication
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Authentication Fields - Show when selected OR when auto-populated */}
        {(useManualAuth || bearerToken) && (
          <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
            <h4 className="text-sm font-medium text-blue-900 mb-3">
              {useManualAuth ? "Manual Authentication" : "Bearer Token (Auto-populated)"}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bearer Token
                </label>
                <div className="relative">
                  <input
                    type={showBearerToken ? "text" : "password"}
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="your-bearer-token"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-aws-orange"
                    disabled={isConnected}
                  />
                  <button
                    type="button"
                    onClick={() => setShowBearerToken(!showBearerToken)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showBearerToken ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Header Name
                </label>
                <input
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  placeholder="Authorization"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-aws-orange"
                  disabled={isConnected}
                />
              </div>
            </div>
          </div>
        )}

        {(usePreregisteredClient || clientId || clientSecret) && (
          <div className="bg-green-50 p-4 rounded-md border border-green-200">
            <h4 className="text-sm font-medium text-green-900 mb-3">
              {usePreregisteredClient ? "OAuth Client Credentials" : "Client Credentials (Auto-populated)"}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="your-client-id"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-aws-orange"
                  disabled={isConnected}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <div className="relative">
                  <input
                    type={showClientSecret ? "text" : "password"}
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="your-client-secret"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-aws-orange"
                    disabled={isConnected}
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientSecret(!showClientSecret)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showClientSecret ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!isConnected && !isConnecting && !isAuthenticating ? (
            <button
              onClick={handleConnect}
              disabled={!serverUrl.trim()}
              className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              {isConnecting ? "Cancel" : isAuthenticating ? "Cancel" : "Disconnect"}
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="mb-4">
        <span className="text-sm font-medium text-gray-700">Status: </span>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Server Information */}
      {isConnected && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium mb-2">Available Tools ({tools.length})</h3>
            {tools.length > 0 ? (
              <div className="space-y-2">
                {tools.map((tool, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <div className="font-medium">{tool.name}</div>
                    <div className="text-sm text-gray-600">{tool.description}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No tools available</p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Available Resources ({resources.length})</h3>
            {resources.length > 0 ? (
              <div className="space-y-2">
                {resources.map((resource, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <div className="font-medium">{resource.name}</div>
                    <div className="text-sm text-gray-600">{resource.description}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No resources available</p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Available Prompts ({prompts.length})</h3>
            {prompts.length > 0 ? (
              <div className="space-y-2">
                {prompts.map((prompt, index) => {
                  // Extract argument names using same logic as execution
                  let argNames: string[] = [];
                  
                  if (prompt.arguments?.properties) {
                    argNames = Object.keys(prompt.arguments.properties);
                  } else if (prompt.arguments?.type === 'object' && prompt.arguments?.properties) {
                    argNames = Object.keys(prompt.arguments.properties);
                  } else if (Array.isArray(prompt.arguments)) {
                    argNames = prompt.arguments.map((arg: any, idx: number) => arg.name || `arg${idx}`);
                  }
                  
                  return (
                    <div key={index} className="p-3 bg-gray-50 rounded-md">
                      <div className="font-medium">@{prompt.name}</div>
                      <div className="text-sm text-gray-600">{prompt.description}</div>
                      <div className="text-xs text-blue-600 mt-1">
                        Usage: @{prompt.name} {argNames.map(arg => `<${arg}>`).join(' ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No prompts available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
