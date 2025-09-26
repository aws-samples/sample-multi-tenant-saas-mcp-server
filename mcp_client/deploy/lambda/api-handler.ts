import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createInferenceHandler, type InferenceParams } from '../../src/shared/inference-handler';
import { handleMcpProxy } from '../../src/shared/mcp-proxy';
import { corsHeaders } from '../../src/shared/cors-config';
import { createLambdaResponse, createHealthCheckResponse, createErrorResponse } from '../../src/shared/response-utils';
import { getAuthConfig, createUserPlaceholderResponse, createValidatePlaceholderResponse } from '../../src/shared/auth-handlers';

type PostInferenceBody = InferenceParams & {
  lora: string | null;
  stream: boolean;
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createLambdaResponse(200, '');
  }

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Health check endpoint
    if (path === '/health' && method === 'GET') {
      return createLambdaResponse(200, createHealthCheckResponse());
    }

    // Authentication endpoints
    if (path === '/api/auth/config' && method === 'GET') {
      return createLambdaResponse(200, getAuthConfig());
    }

    if (path === '/api/auth/user' && method === 'GET') {
      return createLambdaResponse(200, createUserPlaceholderResponse());
    }

    if (path === '/api/auth/validate' && method === 'POST') {
      return createLambdaResponse(200, createValidatePlaceholderResponse());
    }

    // Inference endpoint
    if (path === '/api/inference' && method === 'POST') {
      return await handleInference(event);
    }

    // MCP Proxy endpoint
    if (path.startsWith('/api/mcp-proxy/')) {
      return await handleMcpProxyLambda(event);
    }

    // Route not found
    return createLambdaResponse(404, createErrorResponse('Route not found'));
  } catch (error) {
    console.error('Handler error:', error);
    return createLambdaResponse(500, createErrorResponse(
      'Internal server error',
      error instanceof Error ? error.message : 'Unknown error'
    ));
  }
};

async function handleInference(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return createLambdaResponse(400, createErrorResponse('Request body is required'));
    }

    const {
      model,
      messages,
      system_message,
      max_tokens,
      tools = [],
      resources = [],
      prompts = [],
    }: PostInferenceBody = JSON.parse(event.body);

    // Validate that we have a model ID
    if (!model) {
      return createLambdaResponse(400, createErrorResponse('No model specified'));
    }

    console.log(`Starting inference with model: ${model}`);

    // Use shared inference handler
    const result = await createInferenceHandler({
      model,
      messages,
      system_message,
      max_tokens,
      tools,
      resources,
      prompts,
    });

    // Convert to DataStreamResponse like the local server does
    const dataStreamResponse = result.toDataStreamResponse({
      getErrorMessage: (error: unknown) => {
        console.error('Stream error:', error);
        return 'Error during inference';
      },
    });

    // Since API Gateway doesn't support streaming, we need to collect the response
    // and return it in a format that the frontend can handle
    if (dataStreamResponse.body) {
      const reader = dataStreamResponse.body.getReader();
      let responseText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Convert Uint8Array to string
        const chunk = new TextDecoder().decode(value);
        responseText += chunk;
      }

      // Return the streaming response as text with proper headers
      return {
        statusCode: dataStreamResponse.status,
        headers: {
          ...corsHeaders,
          'Content-Type': dataStreamResponse.headers.get('Content-Type') || 'text/plain',
          'X-Vercel-AI-Data-Stream': dataStreamResponse.headers.get('X-Vercel-AI-Data-Stream') || 'v1',
        },
        body: responseText,
      };
    }

    // Fallback if no body
    return createLambdaResponse(500, createErrorResponse('No response body generated'));
  } catch (error) {
    console.error('Inference error:', error);
    return createLambdaResponse(500, createErrorResponse(
      'Inference failed',
      error instanceof Error ? error.message : 'Unknown error'
    ));
  }
}

async function handleMcpProxyLambda(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return await handleMcpProxy({
    method: event.httpMethod,
    url: event.path,
    headers: event.headers,
    body: event.body,
    queryStringParameters: event.queryStringParameters
  });
}
