import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Get the correct API base URL for the environment
const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return window.location.origin; // http://localhost:5173
  }
  return window.location.origin;
};

// Global fetch interceptor for OAuth URL fixing
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  
  // Handle direct OAuth requests to localhost - redirect to MCP server
  if ((url.includes('/.well-known/oauth-') || url.endsWith('/register')) && url.startsWith(window.location.origin) && !url.includes('/api/mcp-proxy/')) {
    // This should not happen in normal flow - OAuth requests should come with proper context
    // If it does happen, we can't determine which MCP server to redirect to
    console.warn("Direct OAuth request to localhost without MCP server context:", url);
    return Promise.reject(new Error('OAuth requests to localhost require MCP server context'));
  }

  // Fix malformed OAuth URLs
  if (url.includes('/.well-known/') && url.includes('/api/mcp-proxy/')) {
    const match = url.match(/\/\.well-known\/([^\/]+)\/api\/mcp-proxy\/(.+)$/);
    if (match) {
      const wellKnownPath = match[1];
      const encodedServerUrl = match[2];
      const serverUrl = decodeURIComponent(encodedServerUrl);
      const baseServerUrl = serverUrl.replace(/\/mcp$/, '');
      const correctOAuthUrl = `${baseServerUrl}/.well-known/${wellKnownPath}`;
      const apiBaseUrl = getApiBaseUrl();
      const proxyUrl = `${apiBaseUrl}/api/mcp-proxy/${encodeURIComponent(correctOAuthUrl)}`;
      return originalFetch(proxyUrl, init);
    }
  }

  // Proxy external requests
  if (url.startsWith('https://')) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      
      const skipProxyHosts = ['localhost', '127.0.0.1', window.location.hostname];
      const skipProxyPatterns = [/\.amazoncognito\.com$/, /cognito-idp\./, /cognito-identity\./];
      
      if (parsedUrl.pathname.startsWith('/api/mcp-proxy/')) {
        return originalFetch(url, init);
      }
      
      const shouldSkipProxy = skipProxyHosts.includes(hostname) || 
        skipProxyPatterns.some(pattern => pattern.test(hostname));
      
      if (!shouldSkipProxy) {
        const apiBaseUrl = getApiBaseUrl();
        const proxyUrl = `${apiBaseUrl}/api/mcp-proxy/${encodeURIComponent(url)}`;
        
        const response = await originalFetch(proxyUrl, init);
        
        // Handle OAuth protected resource responses
        if (url.includes('oauth-protected-resource') && response.ok && response.headers.get('content-type')?.includes('application/json')) {
          console.log("🔧 Processing OAuth protected resource response for:", url);
          const responseText = await response.text();
          try {
            const data = JSON.parse(responseText);
            console.log("🔧 Original OAuth protected resource data:", data);
            if (data.resource) {
              // Replace the resource URL with the proxy URL
              const originalResource = data.resource;
              const proxyResource = `${apiBaseUrl}/api/mcp-proxy/${encodeURIComponent(originalResource)}`;
              data.resource = proxyResource;
              console.log("🔧 Modified OAuth protected resource:", originalResource, "→", proxyResource);
              
              return new Response(JSON.stringify(data), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            }
          } catch (e) {
            console.warn("Failed to parse OAuth protected resource response:", e);
          }
          
          return new Response(responseText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
        
        return response;
      }
    } catch (error) {
      console.warn("Failed to parse URL for proxy check:", url);
    }
  }

  return originalFetch(input, init);
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
