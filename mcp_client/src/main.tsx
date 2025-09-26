import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Global fetch interceptor for URL fixing
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  
  // Fix malformed OAuth discovery URLs
  if (url.includes('/.well-known/') && url.includes('/api/mcp-proxy/')) {
    
    // Extract the original server URL from the malformed URL
    // Pattern: http://localhost:5173/.well-known/oauth-*/api/mcp-proxy/https%3A%2F%2Fserver.com%2Fmcp
    const match = url.match(/\/\.well-known\/([^\/]+)\/api\/mcp-proxy\/(.+)$/);
    if (match) {
      const wellKnownPath = match[1];
      const encodedServerUrl = match[2];
      const serverUrl = decodeURIComponent(encodedServerUrl);
      
      // Extract base server URL (remove /mcp path)
      const baseServerUrl = serverUrl.replace(/\/mcp$/, '');
      
      // Construct correct OAuth discovery URL
      const correctOAuthUrl = `${baseServerUrl}/.well-known/${wellKnownPath}`;
      
      console.log("  Original malformed URL:", url);
      console.log("  Extracted server URL:", serverUrl);
      console.log("  Base server URL:", baseServerUrl);
      console.log("  Correct OAuth URL:", correctOAuthUrl);
      
      // Redirect through proxy with correct URL
      const proxyUrl = `${window.location.origin}/api/mcp-proxy/${encodeURIComponent(correctOAuthUrl)}`;
      console.log("  Final proxy URL:", proxyUrl);
      
      try {
        const response = await originalFetch(proxyUrl, init);
        
        // If this is an OAuth discovery response, modify the URLs to use proxy
        if (response.headers.get('content-type')?.includes('application/json') && 
            wellKnownPath.includes('oauth')) {
          
          const responseClone = response.clone();
          const responseText = await responseClone.text();
          console.log("🔧 Original OAuth response:", responseText);
          
          try {
            const oauthData = JSON.parse(responseText);
            
            // Replace any references to the original server URL with proxy URL
            const originalServerUrl = serverUrl.replace(/\/mcp$/, '');
            const originalFullUrl = serverUrl; // Keep the full URL with /mcp
            const proxyFullUrl = `${window.location.origin}/api/mcp-proxy/${encodeURIComponent(originalFullUrl)}`;
            
            // Convert the response to string, replace URLs, then parse back
            let modifiedResponseText = responseText;
            
            // Replace resource URLs with properly encoded proxy URLs
            if (oauthData.resource) {
              const originalResource = oauthData.resource;
              modifiedResponseText = modifiedResponseText.replace(
                `"resource":"${originalResource}"`,
                `"resource":"${proxyFullUrl}"`
              );
              console.log("🔧 Modified resource URL:", originalResource, "→", proxyFullUrl);
            }
            
            // Replace any other server URL references with encoded versions
            modifiedResponseText = modifiedResponseText.replace(
              new RegExp(originalFullUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              proxyFullUrl
            );
            modifiedResponseText = modifiedResponseText.replace(
              new RegExp(originalServerUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              `${window.location.origin}/api/mcp-proxy/${encodeURIComponent(originalServerUrl)}`
            );
            
            console.log("🔧 Modified OAuth response:", modifiedResponseText);
            
            // Create new response with modified data
            return new Response(modifiedResponseText, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
            
          } catch (parseError) {
            console.error("❌ Failed to parse/modify OAuth response:", parseError);
            return response;
          }
        }
        
        return response;
      } catch (error) {
        console.error("❌ FIXED OAUTH REQUEST FAILED:", error);
        throw error;
      }
    }
  }
  
  // Check if this is a request to an external server (not localhost and not our own proxy)
  if (url.startsWith('https://') && 
      !url.includes('localhost') && 
      !url.includes('127.0.0.1') &&
      !url.includes('/api/mcp-proxy/') && // Don't proxy our own proxy requests!
      !url.includes('cognito-idp.') && // Don't proxy Cognito Identity Provider API calls
      !url.includes('cognito-identity.') && // Don't proxy Cognito Identity API calls
      !url.includes('.amazoncognito.com') && // Don't proxy any Cognito OAuth servers
      !url.includes(window.location.hostname) // Don't proxy requests to same domain
  ) {
    
    // Redirect ALL external requests through our proxy
    const proxyUrl = `${window.location.origin}/api/mcp-proxy/${encodeURIComponent(url)}`;
    console.log("🔄 Proxying external request:", url, "→", proxyUrl);
    
    try {
      const response = await originalFetch(proxyUrl, init);
      return response;
    } catch (error) {
      console.error("❌ PROXY REQUEST FAILED:", error);
      throw error;
    }
  }
  
  // For localhost requests, use original fetch
  try {
    const response = await originalFetch(input, init);
    
    // Check if we got HTML when expecting JSON (potential error condition)
    if (response.headers.get('content-type')?.includes('text/html') && 
        (init?.method === 'POST' || url.includes('.well-known'))) {
      console.error("❌ GOT HTML INSTEAD OF JSON!");
      const responseClone = response.clone();
      const responseText = await responseClone.text();
      console.error("  Response body:", responseText.substring(0, 500));
    }
    
    return response;
  } catch (error) {
    console.error("❌ LOCAL REQUEST FAILED:", error);
    throw error;
  }
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
