import { processJwt } from "./jwt-verifier.js";
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

export const tokenMiddleware = (req, res, next) => {
  const resourceMetadataUrl = `${req.get('X-Forwarded-Proto') || req.protocol}://${req.get('Host')}/.well-known/oauth-protected-resource`;
  return requireBearerAuth({
    requiredScopes: ["openid"],
    resourceMetadataUrl,
    verifier: {
      verifyAccessToken: async (token) => processJwt(token),
    }
  })(req, res, next);
};