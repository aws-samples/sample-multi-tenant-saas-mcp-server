/**
 * Configuration utilities for API endpoints and environment-specific settings
 */

/**
 * Get the base URL for API calls based on the current environment
 * In production, API calls go through CloudFront to API Gateway
 * In development, they go through Vite's proxy to the local Express server
 */
export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // In development, return empty string so Vite proxy handles routing
    // In production, use current origin for CloudFront routing
    return process.env.NODE_ENV === 'production' ? window.location.origin : '';
  }
  
  // Fallback for SSR or other contexts
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';
};

/**
 * Get the full URL for MCP proxy requests
 */
export const getMcpProxyUrl = (targetUrl: string): string => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/mcp-proxy/${encodeURIComponent(targetUrl)}`;
};

/**
 * Get the full URL for inference API requests
 */
export const getInferenceApiUrl = (): string => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/inference`;
};

/**
 * Check if we're running in development mode
 */
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

/**
 * Check if we're running in production mode
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};
