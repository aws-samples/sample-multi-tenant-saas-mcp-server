import { corsHeaders } from './cors-config.js';

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
}

export function createHealthCheckResponse(): HealthCheckResponse {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

export function createErrorResponse(error: string, details?: string): ErrorResponse {
  return {
    error,
    ...(details && { details }),
  };
}

// Lambda response format
export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function createLambdaResponse(
  statusCode: number,
  body: any,
  contentType: string = 'application/json'
): LambdaResponse {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}
