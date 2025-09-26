export interface AuthConfig {
  userPoolId?: string;
  clientId?: string;
  region?: string;
}

export function getAuthConfig(): AuthConfig {
  return {
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    region: process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1',
  };
}

export interface PlaceholderResponse {
  message: string;
}

export function createUserPlaceholderResponse(): PlaceholderResponse {
  return {
    message: 'User endpoint - JWT validation not implemented yet',
  };
}

export function createValidatePlaceholderResponse(): PlaceholderResponse {
  return {
    message: 'Validate endpoint - JWT validation not implemented yet',
  };
}
