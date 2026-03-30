/**
 * Tests for oauth-metadata.js module
 * Verifies OAuth metadata validation, generation, and request handling functionality
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateConfiguration, generateMetadata, handleMetadataRequest } from '../auth/oauth-metadata.js';

describe('oauth-metadata', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateConfiguration()', () => {
    test('should return isValid: true when all required variables are present', () => {
      process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
      process.env.AWS_REGION = 'us-east-1';

      const result = validateConfiguration();

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should fail when RESOURCE_SERVER_URL is missing', () => {
      delete process.env.RESOURCE_SERVER_URL;
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
      process.env.AWS_REGION = 'us-east-1';

      const result = validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required environment variable: RESOURCE_SERVER_URL');
    });

    test('should fail when COGNITO_USER_POOL_ID is missing', () => {
      process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
      delete process.env.COGNITO_USER_POOL_ID;
      process.env.AWS_REGION = 'us-east-1';

      const result = validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
    });

    test('should fail when AWS_REGION is missing', () => {
      process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
      delete process.env.AWS_REGION;

      const result = validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required environment variable: AWS_REGION');
    });

    test('should reject invalid URL formats', () => {
      const invalidUrls = ['not-a-url', 'just-text', 'http://', '://missing-protocol.com'];

      invalidUrls.forEach(url => {
        process.env.RESOURCE_SERVER_URL = url;
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must be a valid URL');
      });
    });

    test('should reject non-HTTP/HTTPS protocols', () => {
      const invalidProtocols = ['ftp://example.com', 'file:///path', 'ws://example.com'];

      invalidProtocols.forEach(url => {
        process.env.RESOURCE_SERVER_URL = url;
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must use http or https protocol');
      });
    });

    test('should treat empty string as missing', () => {
      process.env.RESOURCE_SERVER_URL = '';
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
      process.env.AWS_REGION = 'us-east-1';

      const result = validateConfiguration();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required environment variable: RESOURCE_SERVER_URL');
    });

    test('should return all errors when multiple variables are missing', () => {
      delete process.env.RESOURCE_SERVER_URL;
      delete process.env.COGNITO_USER_POOL_ID;
      delete process.env.AWS_REGION;

      const result = validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });

    test('should return both missing and invalid URL errors together', () => {
      process.env.RESOURCE_SERVER_URL = 'invalid-url';
      delete process.env.COGNITO_USER_POOL_ID;
      process.env.AWS_REGION = 'us-east-1';

      const result = validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
      expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must be a valid URL');
    });

    test('should handle whitespace-only environment variables as missing', () => {
      process.env.RESOURCE_SERVER_URL = '   ';
      process.env.COGNITO_USER_POOL_ID = '\t\n';
      process.env.AWS_REGION = '';

      const result = validateConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('generateMetadata()', () => {
    test('should generate metadata with all required fields', () => {
      process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
      process.env.AWS_REGION = 'us-east-1';

      const metadata = generateMetadata();

      expect(metadata).toHaveProperty('resource');
      expect(metadata).toHaveProperty('authorization_servers');
      expect(metadata).toHaveProperty('scopes_supported');
      expect(metadata).toHaveProperty('bearer_methods_supported');
    });

    test('should construct resource URL correctly', () => {
      const testCases = [
        { input: 'https://api.example.com', expected: 'https://api.example.com/mcp' },
        { input: 'https://api.example.com:8080', expected: 'https://api.example.com:8080/mcp' },
        { input: 'http://localhost:3000', expected: 'http://localhost:3000/mcp' },
      ];

      testCases.forEach(({ input, expected }) => {
        process.env.RESOURCE_SERVER_URL = input;
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        expect(generateMetadata().resource).toBe(expected);
      });
    });

    test('should construct authorization_servers URL from region and pool ID', () => {
      process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
      process.env.COGNITO_USER_POOL_ID = 'eu-west-1_XYZ987654';
      process.env.AWS_REGION = 'eu-west-1';

      const metadata = generateMetadata();

      expect(metadata.authorization_servers).toEqual([
        'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_XYZ987654'
      ]);
    });
  });

  describe('handleMetadataRequest()', () => {
    let mockReq, mockRes;

    beforeEach(() => {
      mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: vi.fn((header) => {
          if (header === 'User-Agent') return 'Test-Agent/1.0';
          return undefined;
        })
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
    });

    test('should return 200 with valid metadata when configured correctly', () => {
      process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
      process.env.AWS_REGION = 'us-east-1';

      handleMetadataRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const data = mockRes.json.mock.calls[0][0];
      expect(data).toHaveProperty('resource');
      expect(data).toHaveProperty('authorization_servers');
    });

    test('should return 503 when configuration is invalid', () => {
      delete process.env.RESOURCE_SERVER_URL;

      handleMetadataRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "service_unavailable",
        error_description: "OAuth metadata temporarily unavailable due to configuration error"
      });
    });

    test('should handle missing User-Agent header gracefully', () => {
      process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
      process.env.AWS_REGION = 'us-east-1';
      mockReq.get = vi.fn(() => undefined);

      handleMetadataRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
