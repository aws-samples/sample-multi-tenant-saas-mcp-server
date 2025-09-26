import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
// @ts-ignore
import jwksClient from 'jwks-client';

interface CognitoJwtPayload extends jwt.JwtPayload {
  'cognito:username'?: string;
  email?: string;
  token_use?: string;
  sub?: string;
}

interface AuthenticatedRequest extends Request {
  user?: {
    username: string;
    email?: string;
    sub: string;
  };
}

// JWKS client for Cognito
let jwksClientInstance: ReturnType<typeof jwksClient> | null = null;

function getJwksClient() {
  if (!jwksClientInstance) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const region = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';
    
    if (!userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID environment variable is required');
    }

    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    
    jwksClientInstance = jwksClient({
      jwksUri,
      requestHeaders: {},
      timeout: 30000,
    });
  }
  
  return jwksClientInstance;
}

const getKey: jwt.SecretOrKeyProvider = (header, callback) => {
  const client = getJwksClient();
  
  client.getSigningKey(header.kid!, (err: any, key: any) => {
    if (err) {
      return callback(err);
    }
    
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
};

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Verify the JWT token
  jwt.verify(token, getKey, {
    algorithms: ['RS256'],
    issuer: `https://cognito-idp.${process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
  }, (err: any, decoded: any) => {
    if (err) {
      console.error('JWT verification failed:', err);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const payload = decoded as CognitoJwtPayload;
    
    // Ensure this is an access token (not ID token)
    if (payload.token_use !== 'access') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    // Extract user information
    req.user = {
      username: payload['cognito:username'] || payload.sub || 'unknown',
      email: payload.email,
      sub: payload.sub || '',
    };

    next();
  });
};

export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // No token provided, continue without authentication
  }

  // Try to verify the token, but don't fail if it's invalid
  jwt.verify(token, getKey, {
    algorithms: ['RS256'],
    issuer: `https://cognito-idp.${process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
  }, (err: any, decoded: any) => {
    if (!err && decoded) {
      const payload = decoded as CognitoJwtPayload;
      
      if (payload.token_use === 'access') {
        req.user = {
          username: payload['cognito:username'] || payload.sub || 'unknown',
          email: payload.email,
          sub: payload.sub || '',
        };
      }
    }
    
    next(); // Continue regardless of token validity
  });
};
