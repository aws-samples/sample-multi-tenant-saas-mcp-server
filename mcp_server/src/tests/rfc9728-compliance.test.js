/**
 * RFC 9728 Compliance Validation Tests
 * Verifies complete adherence to OAuth 2.0 Protected Resource Metadata specification
 */

import { jest } from '@jest/globals';

describe('RFC 9728 Compliance Validation', () => {
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

  describe('RFC 9728 Section 2: Protected Resource Metadata', () => {
    test('should provide metadata at well-known URI', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'RFC9728-Compliance-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      // RFC 9728 Section 2: Metadata MUST be available at /.well-known/oauth-protected-resource
      expect(mockReq.url).toBe('/.well-known/oauth-protected-resource');
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should include all required metadata fields', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'RFC9728-Fields-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];

      // RFC 9728 Section 2.1: Required fields
      expect(metadata).toHaveProperty('resource');
      expect(metadata).toHaveProperty('authorization_servers');
      expect(metadata).toHaveProperty('scopes_supported');
      expect(metadata).toHaveProperty('bearer_methods_supported');

      // Verify field types per RFC 9728
      expect(typeof metadata.resource).toBe('string');
      expect(Array.isArray(metadata.authorization_servers)).toBe(true);
      expect(Array.isArray(metadata.scopes_supported)).toBe(true);
      expect(Array.isArray(metadata.bearer_methods_supported)).toBe(true);
    });

    test('should use valid URI for resource field', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'RFC9728-URI-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];

      // RFC 9728 Section 2.1: resource MUST be a URI
      expect(() => new URL(metadata.resource)).not.toThrow();
      expect(metadata.resource).toMatch(/^https?:\/\//);
    });

    test('should use valid URIs for authorization_servers', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'RFC9728-AuthServer-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];

      // RFC 9728 Section 2.1: authorization_servers MUST be array of URIs
      expect(Array.isArray(metadata.authorization_servers)).toBe(true);
      expect(metadata.authorization_servers.length).toBeGreaterThan(0);

      metadata.authorization_servers.forEach(server => {
        expect(() => new URL(server)).not.toThrow();
        expect(server).toMatch(/^https:\/\//);
      });
    });
  });


  describe('OAuth 2.0 Scope Compliance', () => {
    

    test('should include all required scopes for the travel booking domain', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'Travel-Scope-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];

      const expectedScopes = [
        "openid",
        "email",
        "profile"
      ];

      expectedScopes.forEach(scope => {
        expect(metadata.scopes_supported).toContain(scope);
      });
    });
  });

  describe('HTTP Response Compliance', () => {
    test('should return proper HTTP status codes', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      // Test successful response
      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'HTTP-Status-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      // RFC 9728: Successful metadata retrieval should return 200
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should return 503 for configuration errors', async () => {
      delete process.env.RESOURCE_SERVER_URL;

      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'HTTP-Error-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      // Service unavailable for configuration errors
      expect(mockRes.status).toHaveBeenCalledWith(503);
    });

    test('should return valid JSON content', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'JSON-Content-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];

      // Should be valid JSON serializable
      expect(() => JSON.stringify(metadata)).not.toThrow();
      expect(typeof metadata).toBe('object');
      expect(metadata).not.toBeNull();
    });
  });

  describe('Security Considerations', () => {
    test('should not expose sensitive configuration in metadata', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'Security-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];
      const metadataString = JSON.stringify(metadata);

      // Should not expose sensitive information
      expect(metadataString).not.toContain('password');
      expect(metadataString).not.toContain('secret');
      expect(metadataString).not.toContain('key');
      expect(metadataString).not.toContain('token');
    });

    test('should use HTTPS URLs for authorization servers', async () => {
      const { handleMetadataRequest } = await import('../oauth-metadata.js');

      const mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn(() => 'HTTPS-Test/1.0')
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      handleMetadataRequest(mockReq, mockRes);

      const metadata = mockRes.json.mock.calls[0][0];

      // All authorization servers should use HTTPS
      metadata.authorization_servers.forEach(server => {
        expect(server).toMatch(/^https:\/\//);
      });
    });
  });

});
