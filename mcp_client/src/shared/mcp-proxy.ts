export interface McpProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
  queryStringParameters?: Record<string, string> | null;
}

export interface McpProxyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export async function handleMcpProxy(request: McpProxyRequest): Promise<McpProxyResponse> {
  try {
    // Extract the target URL from the path
    let targetUrl = request.url.replace('/api/mcp-proxy/', '');
    
    // Handle query parameters
    if (request.queryStringParameters) {
      const queryString = new URLSearchParams(request.queryStringParameters).toString();
      if (queryString) {
        targetUrl += `?${queryString}`;
      }
    }

    // Handle double encoding - decode twice if needed
    let fullUrl = decodeURIComponent(targetUrl);
    
    // Check if it's still encoded (starts with http%3A or https%3A)
    if (fullUrl.startsWith('http%3A') || fullUrl.startsWith('https%3A')) {
      fullUrl = decodeURIComponent(fullUrl);
    }

    // Validate URL and block internal networks
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(fullUrl);
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid URL format' })
      };
    }

    // Block internal networks and metadata services
    const hostname = parsedUrl.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || 
        hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
        hostname === '169.254.169.254') {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access to internal networks blocked' })
      };
    }

    // Prevent path traversal
    if (parsedUrl.pathname.includes('../')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Path traversal not allowed' })
      };
    }

    console.log(`MCP Proxy: ${request.method} ${fullUrl}`);

    const fetchOptions: RequestInit = {
      method: request.method,
      headers: {
        'Content-Type': getHeader(request.headers, 'content-type') || 'application/json',
        'Accept': 'application/json, text/event-stream',
        // Forward authorization and custom headers
        ...(getHeader(request.headers, 'authorization') && { 
          'Authorization': getHeader(request.headers, 'authorization')! 
        }),
        ...(getHeader(request.headers, 'x-custom-auth-header') && getHeader(request.headers, getHeader(request.headers, 'x-custom-auth-header')!) && {
          [getHeader(request.headers, 'x-custom-auth-header')!]: getHeader(request.headers, getHeader(request.headers, 'x-custom-auth-header')!)!
        }),
      },
    };

    // Handle body for non-GET requests
    if (request.method !== 'GET' && request.body) {
      if (getHeader(request.headers, 'content-type') === 'application/x-www-form-urlencoded') {
        fetchOptions.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      } else {
        fetchOptions.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      }
    }

    const response = await fetch(fullUrl, fetchOptions);

    console.log(`Response status: ${response.status}`);
    console.log(`Response content-type: ${response.headers.get('content-type')}`);

    // Handle OAuth registration endpoint that doesn't exist on the server
    if (request.method === 'POST' && fullUrl.includes('/register') && response.status === 404) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        console.log('Server does not support OAuth registration endpoint, providing fallback response');
        
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
          body: JSON.stringify({
            error: 'invalid_client_metadata',
            error_description: 'Dynamic client registration is not supported by this server. Please use pre-configured client credentials or contact the server administrator for access.'
          }),
        };
      }
    }

    // Get response body
    const responseBody = await response.text();

    // Build response headers
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-custom-auth-header',
    };

    // Forward important headers from the response
    const contentType = response.headers.get('content-type');
    if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    }

    const wwwAuth = response.headers.get('www-authenticate');
    if (wwwAuth) {
      responseHeaders['WWW-Authenticate'] = wwwAuth;
    }

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody,
    };

  } catch (error) {
    console.error('MCP Proxy error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-custom-auth-header',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Proxy error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

// Helper function to get header value (case-insensitive)
function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}
