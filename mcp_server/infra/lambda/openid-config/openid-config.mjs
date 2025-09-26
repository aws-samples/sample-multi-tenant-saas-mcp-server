/**
 * OpenID Configuration Lambda Function
 * 
 * Fetches Cognito's OpenID configuration and adds registration_endpoint
 * for dynamic client registration support.
 */

// In-memory cache
let cachedConfig = null;
let cacheExpiry = null;

export const handler = async (event, context) => {
  console.log('OpenID Configuration request received', {
    requestId: context.awsRequestId,
    method: event.httpMethod,
    path: event.path,
    stage: event.requestContext?.stage,
    host: event.headers?.Host,
    stackName: process.env.STACK_NAME,
    stackRegion: process.env.STACK_REGION
  });

  try {
    // Check required environment variables
    const requiredEnvVars = ['COGNITO_USER_POOL_ID', 'DEPLOYMENT_REGION', 'REGISTRATION_ENDPOINT_URL'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing required environment variables:', {
        missing: missingVars,
        stackName: process.env.STACK_NAME,
        available: Object.keys(process.env).filter(key => key.startsWith('COGNITO_') || key.startsWith('DEPLOYMENT_') || key.startsWith('REGISTRATION_') || key.startsWith('STACK_'))
      });
      return createErrorResponse(500, 'server_error', 'OpenID configuration temporarily unavailable');
    }

    // Log configuration for debugging (without sensitive data)
    console.log('Configuration loaded successfully', {
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      region: process.env.DEPLOYMENT_REGION,
      hasRegistrationEndpoint: !!process.env.REGISTRATION_ENDPOINT_URL,
      stackName: process.env.STACK_NAME
    });

    // Get OpenID Configuration metadata (with caching)
    const metadata = await getOpenIDConfiguration();
    
    console.log('OpenID Configuration retrieved successfully', {
      issuer: metadata.issuer,
      authorizationEndpoint: metadata.authorization_endpoint,
      fromCache: !!cachedConfig && Date.now() < cacheExpiry
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Mcp-Protocol-Version'
      },
      body: JSON.stringify(metadata, null, 2)
    };

  } catch (error) {
    console.error('Error in OpenID Configuration handler:', error);
    return createErrorResponse(500, 'server_error', 'OpenID configuration temporarily unavailable');
  }
};

/**
 * Fetches OpenID Configuration from Cognito and adds registration_endpoint
 */
async function getOpenIDConfiguration() {
  // Check cache first
  if (cachedConfig && Date.now() < cacheExpiry) {
    console.log('Returning cached OpenID configuration');
    return cachedConfig;
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const deploymentRegion = process.env.DEPLOYMENT_REGION;
  const registrationEndpointUrl = process.env.REGISTRATION_ENDPOINT_URL;
  
  // Construct Cognito's OpenID configuration URL using the correct format
  const cognitoConfigUrl = `https://cognito-idp.${deploymentRegion}.amazonaws.com/${userPoolId}/.well-known/openid-configuration`;
  
  console.log('Fetching Cognito OpenID configuration', {
    url: cognitoConfigUrl,
    userPoolId,
    deploymentRegion
  });

  try {
    const response = await fetch(cognitoConfigUrl);
    
    if (!response.ok) {
      throw new Error(`Cognito OpenID config request failed: ${response.status} ${response.statusText}`);
    }

    const cognitoConfig = await response.json();
    
    // Add our custom registration_endpoint to Cognito's configuration
    const enhancedConfig = {
      ...cognitoConfig,
      registration_endpoint: registrationEndpointUrl,
      code_challenge_methods_supported: ["S256"]
    };

    // Cache the result - use Cache-Control header or default to 1 hour
    const cacheControl = response.headers.get('cache-control');
    const maxAge = parseCacheControl(cacheControl) || 3600; // Default 1 hour
    
    cachedConfig = enhancedConfig;
    cacheExpiry = Date.now() + (maxAge * 1000);
    
    console.log('Successfully fetched and cached Cognito OpenID configuration', {
      issuer: cognitoConfig.issuer,
      cacheMaxAge: maxAge,
      cacheExpiry: new Date(cacheExpiry).toISOString()
    });

    return enhancedConfig;

  } catch (error) {
    console.error('Failed to fetch Cognito OpenID configuration:', error);
    throw new Error(`Unable to retrieve OpenID configuration: ${error.message}`);
  }
}

/**
 * Parses Cache-Control header to extract max-age value
 */
function parseCacheControl(cacheControl) {
  if (!cacheControl) return null;
  
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  return maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : null;
}

/**
 * Creates a standardized error response
 */
function createErrorResponse(statusCode, error, errorDescription) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Mcp-Protocol-Version'
    },
    body: JSON.stringify({
      error: error,
      error_description: errorDescription
    })
  };
}
