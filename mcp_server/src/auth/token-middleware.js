import { processJwt } from "./jwt-verifier.js";
import config from '../utils/env-config.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

export const tokenMiddleware = requireBearerAuth({
  requiredScopes: ["openid"],
  resourceMetadataUrl: `${config.get('RESOURCE_SERVER_URL')}/.well-known/oauth-protected-resource`, 
  verifier: {
    verifyAccessToken: async (token) => {
      return processJwt(token)
        .then(result => {
          return result;
        })
        .catch(error => {
          throw error;
        });
    }
  }
})