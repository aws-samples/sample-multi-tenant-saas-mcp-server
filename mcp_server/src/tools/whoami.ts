import log4js from "../utils/logging.js";
import { verifyToken } from "../auth/jwt-verifier.js";

const l = log4js.getLogger();

/**
 * whoami tool implementation
 * Returns information about the current user based on their JWT token
 */
export default async function whoami({authInfo}) {
  try {
    const token = authInfo.token;
    const tokenResult = await verifyToken(token);
    const result = {
        userInfo: tokenResult ? {
          username: tokenResult.username || tokenResult["cognito:username"] || tokenResult.sub,
          email: tokenResult.email,
          tenantId: tokenResult["custom:tenantId"] || tokenResult.tenantId,
          tenantTier: tokenResult["custom:tenantTier"] || tokenResult.tenantTier
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
          region: process.env.AWS_REGION || 'us-east-1'
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
    l.error(`Error in whoami tool: ${error.message}`);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error processing request: ${error.message}`
        }
      ]
    };
  }
}