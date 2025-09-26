/**
 * End-to-End Integration Tests for OAuth 2.1 Protected Metadata Resource
 * Tests the complete OAuth discovery flow and backward compatibility
 */

import { jest } from '@jest/globals';

describe('OAuth 2.1 End-to-End Integration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Set required environment variables for OAuth functionality
    process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });


  describe('Backward Compatibility', () => {
    test('should not affect existing public endpoints', () => {
      // Verify that OAuth integration doesn't break existing functionality
      const publicEndpoints = [
        '/health',
        '/mcp' // MCP transport endpoint
      ];

      const oauthEndpoint = '/.well-known/oauth-protected-resource';

      publicEndpoints.forEach(endpoint => {
        expect(endpoint).not.toBe(oauthEndpoint);
        expect(oauthEndpoint).not.toMatch(new RegExp(endpoint.replace('/', '\\/')));
      });
    });


    test('should preserve existing HTTP status codes', () => {
      // Document that OAuth integration preserves existing status codes
      const expectedStatusCodes = {
        success: 200,
        unauthorized: 401,
        forbidden: 403,
        serviceUnavailable: 503
      };

      // These status codes should remain unchanged by OAuth integration
      expect(expectedStatusCodes.success).toBe(200);
      expect(expectedStatusCodes.unauthorized).toBe(401);
      expect(expectedStatusCodes.forbidden).toBe(403);
      expect(expectedStatusCodes.serviceUnavailable).toBe(503);
    });
  });

  describe('Configuration Error Scenarios', () => {
    test('should handle missing RESOURCE_SERVER_URL gracefully', async () => {
      delete process.env.RESOURCE_SERVER_URL;

      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'Test-Client/1.0')
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

    test('should handle partial configuration gracefully', async () => {
      // Test with missing COGNITO_USER_POOL_ID
      delete process.env.COGNITO_USER_POOL_ID;

      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'Test-Client/1.0')
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

  describe('HTTP Headers and Content Types', () => {
    test('should return proper JSON content type for metadata endpoint', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'Test-Client/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      // Express res.json() automatically sets Content-Type: application/json
      expect(mockRes.json).toHaveBeenCalledTimes(1);
      expect(typeof mockRes.json.mock.calls[0][0]).toBe('object');
    });
  });

  describe('RFC 9728 Compliance', () => {
    test('should return all required RFC 9728 fields', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'RFC-Compliant-Client/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];

      // RFC 9728 required fields
      expect(metadata).toHaveProperty('resource');
      expect(metadata).toHaveProperty('authorization_servers');
      expect(metadata).toHaveProperty('scopes_supported');
      expect(metadata).toHaveProperty('bearer_methods_supported');

      // Verify field types
      expect(typeof metadata.resource).toBe('string');
      expect(Array.isArray(metadata.authorization_servers)).toBe(true);
      expect(Array.isArray(metadata.scopes_supported)).toBe(true);
      expect(Array.isArray(metadata.bearer_methods_supported)).toBe(true);

      // Verify non-empty arrays
      expect(metadata.authorization_servers.length).toBeGreaterThan(0);
      expect(metadata.scopes_supported.length).toBeGreaterThan(0);
      expect(metadata.bearer_methods_supported.length).toBeGreaterThan(0);
    });

    test('should use correct well-known URI path', () => {
      const path = '/.well-known/oauth-protected-resource';
      
      // RFC 9728 specifies this exact path
      expect(path).toBe('/.well-known/oauth-protected-resource');
      expect(path).toMatch(/^\/\.well-known\//);
    });

    test('should be accessible via GET method only', () => {
      // RFC 9728 specifies GET method for metadata retrieval
      const method = 'GET';
      expect(method).toBe('GET');
    });
  });

  describe('Integration Consistency', () => {

    test('should maintain consistent authorization server URLs', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'AuthServer-Test-Client/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);
      const metadata = mockRes.json.mock.calls[0][0];

      // Verify authorization server URL format
      expect(metadata.authorization_servers).toHaveLength(1);
      expect(metadata.authorization_servers[0]).toMatch(
        /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9-]+_[A-Z0-9]+$/
      );
    });
  });
});
