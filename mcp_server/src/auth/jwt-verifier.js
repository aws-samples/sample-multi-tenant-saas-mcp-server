import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import log4js from "../utils/logging.js";
import config from '../utils/env-config.js';
import { InvalidTokenError, ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const l = log4js.getLogger("JWT Verifier");

// Cache for JWKS client to avoid recreating it
let jwksClientInstance = null;

export async function processJwt(token) {
  try {
    const userData = await verifyToken(token);
    l.info('JWT verified successfully with Cognito');

    const response = {
      token: token,
      client_id: userData.client_id,
      scopes: userData.scope.split(' '),
      expiresAt: userData.exp,
      extra: {
        userId: userData.sub || "anonymous",
        tenantId: userData["custom:tenantId"] || userData.tenantId || "",
        tenantTier: userData["custom:tenantTier"] || userData.tenantTier || "basic",
      }
    };
   
    return response;
  } catch (error) {
    l.error(`Cognito JWT verification failed: ${error.message}`);
    if (error.name === 'TokenExpiredError') {
      throw new InvalidTokenError('Authentication failed: Your token has expired. Please log in again.');
    } else if (error.name === 'JsonWebTokenError') {
      throw new InvalidTokenError('Authentication failed: Invalid token format or signature.');
    } else if (error.name === 'NotBeforeError') {
      throw new InvalidTokenError('Authentication failed: Token not yet valid.');
    } else if (error.message.includes('signing key')) {
      throw new InvalidTokenError('Authentication failed: Token was not issued by the expected authority.');
    } else {
      throw new ServerError('Authentication failed: Token verification error.');
    }
  }
}

/**
 * Verify JWT token with Cognito
 */
export function verifyToken(token) {
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
function getKey(header, callback) {
  const client = getJwksClient();
  
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      l.error('Error getting signing key:', err);
      callback(err);
      return;
    }
    
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}
