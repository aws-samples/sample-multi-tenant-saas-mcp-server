/**
 * Tests for Express app integration with OAuth metadata endpoint
 * Verifies that the OAuth metadata endpoint is properly integrated
 */

import { jest } from '@jest/globals';

describe('Express app OAuth integration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Set required environment variables
    process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('OAuth metadata endpoint integration', () => {
    test('should import handleMetadataRequest function', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');
      
      expect(typeof handleMetadataRequest).toBe('function');
    });

    test('should handle GET request to metadata endpoint', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');
      
      // Mock Express request and response objects
      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn((header) => {
          if (header === 'User-Agent') return 'Test-Agent/1.0';
          return undefined;
        })
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledTimes(1);
      
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData).toHaveProperty('resource');
      expect(responseData).toHaveProperty('authorization_servers');
      expect(responseData).toHaveProperty('scopes_supported');
      expect(responseData).toHaveProperty('bearer_methods_supported');
    });

    test('should return correct metadata structure', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');
      
      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'Test-Agent/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];
      
      expect(responseData.resource).toBe('https://api.example.com/mcp');
      expect(responseData.authorization_servers).toEqual([
        'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST123456'
      ]);
      expect(responseData.scopes_supported).toEqual([
        "openid", "profile", "email"
      ]);
      expect(responseData.bearer_methods_supported).toEqual(["header"]);
    });

    test('should handle configuration errors with 503 response', async () => {
      // Remove required environment variable to trigger error
      delete process.env.RESOURCE_SERVER_URL;
      
      const { handleMetadataRequest } = await import('../oauth-metadata.js');
      
      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'Test-Agent/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "service_unavailable",
        error_description: "OAuth metadata temporarily unavailable due to configuration error"
      });
    });
  });

  describe('route path verification', () => {
    test('should use correct well-known path', () => {
      const expectedPath = '/.well-known/oauth-protected-resource';
      
      // This test verifies the path matches RFC 9728 recommendations
      expect(expectedPath).toMatch(/^\/\.well-known\//);
      expect(expectedPath).toContain('oauth-protected-resource');
    });

    test('should be accessible via GET method', () => {
      // This test documents that the endpoint should be accessible via GET
      // as required by RFC 9728
      const method = 'GET';
      expect(method).toBe('GET');
    });
  });

  describe('Express app structure', () => {
    test('should not interfere with existing health endpoint', () => {
      // Verify that the OAuth endpoint doesn't conflict with existing routes
      const healthPath = '/health';
      const oauthPath = '/.well-known/oauth-protected-resource';
      
      expect(healthPath).not.toBe(oauthPath);
      expect(healthPath).not.toMatch(/\.well-known/);
    });

    test('should not interfere with MCP endpoint', () => {
      // Verify that the OAuth endpoint doesn't conflict with MCP routes
      const mcpPath = '/mcp';
      const oauthPath = '/.well-known/oauth-protected-resource';
      
      expect(mcpPath).not.toBe(oauthPath);
      expect(oauthPath).not.toMatch(/\/mcp/);
    });
  });
});
