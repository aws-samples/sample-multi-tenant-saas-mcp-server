import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import log4js from "../utils/logging.js";
import config from '../utils/env-config.js';
import { InvalidTokenError, ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

const l = log4js.getLogger("JWT Verifier");

// Cache for JWKS client to avoid recreating it
let jwksClientInstance: jwksClient.JwksClient | null = null;

/**
 * Typed view of the Cognito access-token claims we consume.
 *
 * `JwtPayload` from `jsonwebtoken` declares an `[key: string]: any` index
 * signature, which propagates `any` into anything that reads off the payload
 * (triggering `no-unsafe-*` rules). This interface re-declares just the claims
 * we actually read with concrete types so the downstream code stays type-safe.
 */
export interface CognitoJwtClaims extends JwtPayload {
  client_id?: string;
  scope?: string;
  username?: string;
  "cognito:username"?: string;
  email?: string;
  token_use?: string;
  "custom:tenantId"?: string;
  "custom:tenantTier"?: string;
  tenantId?: string;
  tenantTier?: string;
}

export async function processJwt(token: string): Promise<AuthInfo> {
  try {
    const userData = (await verifyToken(token)) as CognitoJwtClaims;
    l.info('JWT verified successfully with Cognito');

    const response: AuthInfo = {
      token: token,
      clientId: userData.client_id ?? "",
      scopes: (userData.scope ?? "").split(' '),
      expiresAt: userData.exp,
      extra: {
        userId: userData.sub ?? "anonymous",
        tenantId: userData["custom:tenantId"] ?? userData.tenantId ?? "",
        tenantTier: userData["custom:tenantTier"] ?? userData.tenantTier ?? "basic",
      }
    };
   
    return response;
  } catch (error) {
    const err = error instanceof Error ? error : undefined;
    const message = err?.message ?? String(error);
    l.error(`Cognito JWT verification failed: ${message}`);
    if (err?.name === 'TokenExpiredError') {
      throw new InvalidTokenError('Authentication failed: Your token has expired. Please log in again.');
    } else if (err?.name === 'JsonWebTokenError') {
      throw new InvalidTokenError('Authentication failed: Invalid token format or signature.');
    } else if (err?.name === 'NotBeforeError') {
      throw new InvalidTokenError('Authentication failed: Token not yet valid.');
    } else if (message.includes('signing key')) {
      throw new InvalidTokenError('Authentication failed: Token was not issued by the expected authority.');
    } else {
      throw new ServerError('Authentication failed: Token verification error.');
    }
  }
}

/**
 * Verify JWT token with Cognito
 */
export function verifyToken(token: string): Promise<JwtPayload | string | undefined> {
  return new Promise((resolve, reject) => {
    const userPoolId = config.COGNITO_USER_POOL_ID;
    const region = config.get('AWS_REGION', 'us-east-1');
    
    if (!userPoolId) {
      reject(new Error('COGNITO_USER_POOL_ID environment variable is required'));
      return;
    }

    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    
    // Remove hardcoded audience validation to support DCR clients
    // We only validate the issuer (User Pool) - any valid client in the pool is accepted
    jwt.verify(token, getKey, {
      issuer: issuer,
      algorithms: ['RS256']
      // Note: audience validation removed to support Dynamic Client Registration
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

/**
 * Initialize JWKS client for Cognito JWT verification
 */
function getJwksClient() {
  if (!jwksClientInstance) {
    const userPoolId = config.COGNITO_USER_POOL_ID;
    const region = config.get('AWS_REGION', 'us-east-1');
    
    if (!userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID environment variable is required');
    }

    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    
    l.debug(`Initializing JWKS client with URI: ${jwksUri}`);
    
    jwksClientInstance = jwksClient({
      jwksUri: jwksUri,
      requestHeaders: {}, // Optional
      timeout: 30000, // Defaults to 30s
      cache: true,
      cacheMaxEntries: 5, // Default value
      cacheMaxAge: 600000, // Default value (10 minutes)
    });
  }
  
  return jwksClientInstance;
}

/**
 * Get signing key for JWT verification
 */
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  const client = getJwksClient();
  
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      l.error('Error getting signing key:', err);
      callback(err);
      return;
    }
    
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}
