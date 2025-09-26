
import log4js from "../utils/logging.js";
import config from '../utils/env-config.js';

const l = log4js.getLogger();

/**
 * Express.js handler for the OAuth metadata endpoint
 * 
 * Handles GET requests to the Protected Metadata Resource endpoint according to RFC 9728.
 * Validates configuration, generates metadata, and returns appropriate HTTP responses.
 * 
 * Success Response (200):
 * - Returns RFC 9728 JSON metadata
 * - Sets Content-Type: application/json
 * 
 * Error Response (503):
 * - Returns when configuration validation fails
 * - Includes error details in JSON format
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * @example
 * app.get('/.well-known/oauth-protected-resource', handleMetadataRequest);
 */
export const handleMetadataRequest = (req, res) => {
  l.debug('OAuth metadata endpoint accessed', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  try {
    // Validate configuration first
    const validation = validateConfiguration();
    
    if (!validation.isValid) {
      l.error('OAuth metadata configuration validation failed', {
        errors: validation.errors,
        errorCount: validation.errors.length
      });
      
      // Return 503 Service Unavailable for configuration errors
      return res.status(503).json({
        error: "service_unavailable",
        error_description: "OAuth metadata temporarily unavailable due to configuration error"
      });
    }
    
    // Generate metadata
    const metadata = generateMetadata();
    
    // Return 200 OK with metadata JSON
    res.status(200).json(metadata);
    
  } catch (error) {
    l.error('Unexpected error in OAuth metadata endpoint', {
      error: error.message,
      stack: error.stack
    });
    
    // Return 503 for any unexpected errors
    res.status(503).json({
      error: "service_unavailable",
      error_description: "OAuth metadata temporarily unavailable due to configuration error"
    });
  }
};

/**
 * OAuth 2.1 Protected Metadata Resource implementation
 * Provides RFC 9728 metadata validation and generation
 */
export const generateMetadata = () => {
  const resourceServerUrl = config.get('RESOURCE_SERVER_URL');
  const userPoolId = config.get('COGNITO_USER_POOL_ID');
  const region = config.get('AWS_REGION');
  const dcrEnabled = config.get('DCR_ENABLED', 'false').toLowerCase() === 'true';
  const authorizationServerUrl = config.get('AUTHORIZATION_SERVER_WITH_DCR_URL');
  
  // Construct dynamic fields from environment variables
  const resource = `${resourceServerUrl}/mcp`;
  
  // Choose authorization server based on DCR_ENABLED flag
  let authorizationServers;
  if (dcrEnabled && authorizationServerUrl) {
    // Use OAuth proxy authorization server URL when DCR is enabled
    authorizationServers = [authorizationServerUrl.replace(/\/$/, '')];
    l.debug('Using OAuth proxy authorization server (DCR enabled)');
  } else {
    // Use direct Cognito authorization server URL
    authorizationServers = [`https://cognito-idp.${region}.amazonaws.com/${userPoolId}`];
    l.debug('Using direct Cognito authorization server (DCR disabled or no proxy URL)');
  }
  
  // Define static fields
  const scopesSupported = [
    "openid",
    "profile", 
    "email"
  ];
  
  const bearerMethodsSupported = ["header"];
  
  const metadata = {
    resource,
    authorization_servers: authorizationServers,
    scopes_supported: scopesSupported,
    bearer_methods_supported: bearerMethodsSupported
  };
  
  l.debug('OAuth metadata generated successfully');
  
  return metadata;
};



export const validateConfiguration = () => {
  const errors = [];
  
  // Check for required environment variables
  const resourceServerUrl = config.get('RESOURCE_SERVER_URL');
  if (isEmpty(resourceServerUrl)) {
    errors.push('Missing required environment variable: RESOURCE_SERVER_URL');
  }
  
  const cognitoUserPoolId = config.get('COGNITO_USER_POOL_ID');
  if (isEmpty(cognitoUserPoolId)) {
    errors.push('Missing required environment variable: COGNITO_USER_POOL_ID');
  }
  
  const awsRegion = config.get('AWS_REGION');
  if (isEmpty(awsRegion)) {
    errors.push('Missing required environment variable: AWS_REGION');
  }
  
  // Validate URL format for RESOURCE_SERVER_URL if provided and not empty
  if (!isEmpty(resourceServerUrl)) {
    try {
      const url = new URL(resourceServerUrl);
      // Only allow HTTP and HTTPS protocols for OAuth resource servers
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        errors.push('Invalid RESOURCE_SERVER_URL format: must use http or https protocol');
      }
    } catch (error) {
      errors.push('Invalid RESOURCE_SERVER_URL format: must be a valid URL');
    }
  }
  
  const isValid = errors.length === 0;
  
  // Log validation results
  if (isValid) {
    l.debug('OAuth metadata configuration validation passed');
  } else {
    l.error('OAuth metadata configuration validation failed:', errors);
  }
  
  return {
    isValid,
    errors
  };
};

// Helper function to check if a value is effectively empty (null, undefined, or whitespace-only)
const isEmpty = (value) => {
  return !value || (typeof value === 'string' && value.trim() === '');
};
