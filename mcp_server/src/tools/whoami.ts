import log4js from "../utils/logging.js";
import { verifyToken } from "../auth/jwt-verifier.js";
import type { CognitoJwtClaims } from "../auth/jwt-verifier.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";

const l = log4js.getLogger();

/**
 * whoami tool implementation
 * Returns information about the current user based on their JWT token.
 * The `tokenMiddleware` guarantees `authInfo` is set before this handler runs.
 */
const whoami = async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<CallToolResult> => {
  try {
    const { authInfo } = extra;
    const token = authInfo!.token;
    const verified = await verifyToken(token);
    // `verifyToken` may return a decoded payload, a raw string, or undefined.
    // Only a decoded object payload has the claims we consume here.
    const tokenResult: CognitoJwtClaims | undefined =
      typeof verified === 'object' && verified !== null ? verified : undefined;
    const result = {
        userInfo: tokenResult ? {
          username: tokenResult.username ?? tokenResult["cognito:username"] ?? tokenResult.sub,
          email: tokenResult.email,
          tenantId: tokenResult["custom:tenantId"] ?? tokenResult.tenantId,
          tenantTier: tokenResult["custom:tenantTier"] ?? tokenResult.tenantTier
        } : null,
        tokenInfo: {
          issuer: tokenResult?.iss,
          audience: tokenResult?.aud,
          expiration: tokenResult?.exp ? new Date(tokenResult.exp * 1000).toISOString() : null,
          issuedAt: tokenResult?.iat ? new Date(tokenResult.iat * 1000).toISOString() : null,
          tokenUse: tokenResult?.token_use
        },
        environment: {
          cognitoConfigured: !!process.env.COGNITO_USER_POOL_ID,
          region: process.env.AWS_REGION ?? 'us-east-1'
        }
      };
    
    // Return in the format expected by the MCP SDK
    return {
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify(result)
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    l.error(`Error in whoami tool: ${message}`);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error processing request: ${message}`
        }
      ]
    };
  }
};

export default whoami;