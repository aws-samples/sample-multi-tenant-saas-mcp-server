import type { Request, Response, NextFunction } from "express";
import { processJwt } from "./jwt-verifier.js";
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

export const tokenMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const resourceMetadataUrl = `${req.get('X-Forwarded-Proto') ?? req.protocol}://${req.get('Host') ?? ''}/.well-known/oauth-protected-resource`;
  requireBearerAuth({
    requiredScopes: ["openid"],
    resourceMetadataUrl,
    verifier: {
      verifyAccessToken: (token) => processJwt(token),
    }
  })(req, res, next);
};