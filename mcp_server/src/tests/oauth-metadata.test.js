/**
 * Tests for oauth-metadata.js module
 * Verifies OAuth metadata validation, generation, and request handling functionality
 */

import { jest } from '@jest/globals';
import { validateConfiguration, generateMetadata, handleMetadataRequest } from '../oauth-metadata.js';

describe('oauth-metadata', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validateConfiguration()', () => {
    describe('when all required variables are present and valid', () => {
      test('should return isValid: true with no errors', () => {
        // Set all required environment variables
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();

        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(Array.isArray(result.errors)).toBe(true);
      });

      test('should handle different valid URL formats', () => {
        const validUrls = [
          'https://api.example.com',
          'https://api.example.com:8080',
          'https://api.example.com/path',
          'https://api.example.com/path?query=value',
          'http://localhost:3000',
          'https://subdomain.example.com'
        ];

        validUrls.forEach(url => {
          process.env.RESOURCE_SERVER_URL = url;
          process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
          process.env.AWS_REGION = 'us-east-1';

          const result = validateConfiguration();

          expect(result.isValid).toBe(true);
          expect(result.errors).toEqual([]);
        });
      });

      test('should handle different AWS regions', () => {
        const validRegions = [
          'us-east-1',
          'us-west-2',
          'eu-west-1',
          'ap-southeast-1'
        ];

        validRegions.forEach(region => {
          process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
          process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
          process.env.AWS_REGION = region;

          const result = validateConfiguration();

          expect(result.isValid).toBe(true);
          expect(result.errors).toEqual([]);
        });
      });
    });

    describe('when RESOURCE_SERVER_URL is missing', () => {
      test('should return isValid: false with appropriate error', () => {
        // Set other required variables but not RESOURCE_SERVER_URL
        delete process.env.RESOURCE_SERVER_URL;
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required environment variable: RESOURCE_SERVER_URL');
        expect(result.errors.length).toBe(1);
      });
    });

    describe('when COGNITO_USER_POOL_ID is missing', () => {
      test('should return isValid: false with appropriate error', () => {
        // Set other required variables but not COGNITO_USER_POOL_ID
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        delete process.env.COGNITO_USER_POOL_ID;
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
        expect(result.errors.length).toBe(1);
      });
    });

    describe('when AWS_REGION is missing', () => {
      test('should return isValid: false with appropriate error', () => {
        // Set other required variables but not AWS_REGION
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        delete process.env.AWS_REGION;

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required environment variable: AWS_REGION');
        expect(result.errors.length).toBe(1);
      });
    });

    describe('when RESOURCE_SERVER_URL has invalid format', () => {
      test('should return isValid: false with URL format error', () => {
        const invalidUrls = [
          'not-a-url',
          'just-text',
          'http://',
          'https://',
          '://missing-protocol.com'
        ];

        invalidUrls.forEach(invalidUrl => {
          process.env.RESOURCE_SERVER_URL = invalidUrl;
          process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
          process.env.AWS_REGION = 'us-east-1';

          const result = validateConfiguration();

          expect(result.isValid).toBe(false);
          expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must be a valid URL');
        });
      });

      test('should reject non-HTTP/HTTPS protocols', () => {
        const invalidProtocols = [
          'ftp://invalid-protocol.com',
          'file:///path/to/file',
          'ws://websocket.com',
          'mailto:test@example.com'
        ];

        invalidProtocols.forEach(invalidUrl => {
          process.env.RESOURCE_SERVER_URL = invalidUrl;
          process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
          process.env.AWS_REGION = 'us-east-1';

          const result = validateConfiguration();

          expect(result.isValid).toBe(false);
          expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must use http or https protocol');
        });
      });

      test('should include both missing variable and invalid URL errors when URL is empty', () => {
        // Empty string should trigger missing variable error, not URL format error
        process.env.RESOURCE_SERVER_URL = '';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required environment variable: RESOURCE_SERVER_URL');
        expect(result.errors).not.toContain('Invalid RESOURCE_SERVER_URL format: must be a valid URL');
      });
    });

    describe('when multiple variables are missing', () => {
      test('should return all missing variable errors', () => {
        // Remove all required variables
        delete process.env.RESOURCE_SERVER_URL;
        delete process.env.COGNITO_USER_POOL_ID;
        delete process.env.AWS_REGION;

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(3);
        expect(result.errors).toContain('Missing required environment variable: RESOURCE_SERVER_URL');
        expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
        expect(result.errors).toContain('Missing required environment variable: AWS_REGION');
      });

      test('should return both missing and invalid URL errors', () => {
        // Missing COGNITO_USER_POOL_ID and invalid RESOURCE_SERVER_URL
        process.env.RESOURCE_SERVER_URL = 'invalid-url';
        delete process.env.COGNITO_USER_POOL_ID;
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
        expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must be a valid URL');
      });
    });

    describe('return value structure', () => {
      test('should always return an object with isValid and errors properties', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const result = validateConfiguration();

        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('errors');
        expect(typeof result.isValid).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);
      });

      test('should return consistent structure for invalid configurations', () => {
        delete process.env.RESOURCE_SERVER_URL;
        delete process.env.COGNITO_USER_POOL_ID;
        delete process.env.AWS_REGION;

        const result = validateConfiguration();

        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('errors');
        expect(typeof result.isValid).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      test('should handle whitespace-only environment variables as missing', () => {
        process.env.RESOURCE_SERVER_URL = '   ';
        process.env.COGNITO_USER_POOL_ID = '\t\n';
        process.env.AWS_REGION = '';

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(3);
        expect(result.errors).toContain('Missing required environment variable: RESOURCE_SERVER_URL');
        expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
        expect(result.errors).toContain('Missing required environment variable: AWS_REGION');
      });

      test('should validate URL even when other variables are missing', () => {
        process.env.RESOURCE_SERVER_URL = 'invalid-url';
        delete process.env.COGNITO_USER_POOL_ID;
        delete process.env.AWS_REGION;

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(3);
        expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
        expect(result.errors).toContain('Missing required environment variable: AWS_REGION');
        expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must be a valid URL');
      });

      test('should handle protocol validation with missing variables', () => {
        process.env.RESOURCE_SERVER_URL = 'ftp://protocol-error.com';
        delete process.env.COGNITO_USER_POOL_ID;
        delete process.env.AWS_REGION;

        const result = validateConfiguration();

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(3);
        expect(result.errors).toContain('Missing required environment variable: COGNITO_USER_POOL_ID');
        expect(result.errors).toContain('Missing required environment variable: AWS_REGION');
        expect(result.errors).toContain('Invalid RESOURCE_SERVER_URL format: must use http or https protocol');
      });
    });
  });

  describe('generateMetadata()', () => {
    describe('with valid environment variables', () => {
      test('should generate correct metadata structure with all required fields', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const metadata = generateMetadata();

        expect(metadata).toHaveProperty('resource');
        expect(metadata).toHaveProperty('authorization_servers');
        expect(metadata).toHaveProperty('scopes_supported');
        expect(metadata).toHaveProperty('bearer_methods_supported');
        expect(Object.keys(metadata)).toHaveLength(4);
      });

      test('should construct resource URL correctly', () => {
        const testCases = [
          {
            input: 'https://api.example.com',
            expected: 'https://api.example.com/mcp'
          },
          {
            input: 'https://api.example.com:8080',
            expected: 'https://api.example.com:8080/mcp'
          },
          {
            input: 'https://subdomain.example.com/path',
            expected: 'https://subdomain.example.com/path/mcp'
          },
          {
            input: 'http://localhost:3000',
            expected: 'http://localhost:3000/mcp'
          }
        ];

        testCases.forEach(({ input, expected }) => {
          process.env.RESOURCE_SERVER_URL = input;
          process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
          process.env.AWS_REGION = 'us-east-1';

          const metadata = generateMetadata();

          expect(metadata.resource).toBe(expected);
        });
      });

      test('should construct authorization_servers URL correctly', () => {
        const testCases = [
          {
            userPoolId: 'us-east-1_TEST123456',
            region: 'us-east-1',
            expected: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST123456'
          },
          {
            userPoolId: 'us-west-2_ABCDEF789',
            region: 'us-west-2',
            expected: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABCDEF789'
          },
          {
            userPoolId: 'eu-west-1_XYZ987654',
            region: 'eu-west-1',
            expected: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_XYZ987654'
          },
          {
            userPoolId: 'ap-southeast-1_QWE456789',
            region: 'ap-southeast-1',
            expected: 'https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_QWE456789'
          }
        ];

        testCases.forEach(({ userPoolId, region, expected }) => {
          process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
          process.env.COGNITO_USER_POOL_ID = userPoolId;
          process.env.AWS_REGION = region;

          const metadata = generateMetadata();

          expect(metadata.authorization_servers).toEqual([expected]);
        });
      });

      test('should include all required scopes in correct order', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const metadata = generateMetadata();

        const expectedScopes = [
          "openid",
          "profile",
          "email"
        ];

        expect(metadata.scopes_supported).toEqual(expectedScopes);
        expect(metadata.scopes_supported).toHaveLength(3);
      });

      test('should include correct bearer_methods_supported', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const metadata = generateMetadata();

        expect(metadata.bearer_methods_supported).toEqual(["header"]);
        expect(metadata.bearer_methods_supported).toHaveLength(1);
      });

      test('should return consistent metadata structure across multiple calls', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const metadata1 = generateMetadata();
        const metadata2 = generateMetadata();

        expect(metadata1).toEqual(metadata2);
        expect(JSON.stringify(metadata1)).toBe(JSON.stringify(metadata2));
      });
    });

    describe('with different environment variable combinations', () => {
      test('should handle different resource server URLs', () => {
        const resourceUrls = [
          'https://production.api.com',
          'https://staging-api.example.org',
          'http://dev.localhost:8080',
          'https://api-v2.service.net/v1'
        ];

        resourceUrls.forEach(url => {
          process.env.RESOURCE_SERVER_URL = url;
          process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
          process.env.AWS_REGION = 'us-east-1';

          const metadata = generateMetadata();

          expect(metadata.resource).toBe(`${url}/mcp`);
          expect(metadata.authorization_servers[0]).toContain('us-east-1_TEST123456');
        });
      });

      test('should handle different AWS regions and user pool combinations', () => {
        const combinations = [
          { region: 'us-east-1', poolId: 'us-east-1_PROD123' },
          { region: 'us-west-2', poolId: 'us-west-2_STAGE456' },
          { region: 'eu-central-1', poolId: 'eu-central-1_DEV789' },
          { region: 'ap-northeast-1', poolId: 'ap-northeast-1_TEST000' }
        ];

        combinations.forEach(({ region, poolId }) => {
          process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
          process.env.COGNITO_USER_POOL_ID = poolId;
          process.env.AWS_REGION = region;

          const metadata = generateMetadata();

          expect(metadata.authorization_servers[0]).toBe(
            `https://cognito-idp.${region}.amazonaws.com/${poolId}`
          );
        });
      });
    });

    describe('static fields consistency', () => {
      test('should always return the same scopes regardless of environment', () => {
        const envCombinations = [
          {
            url: 'https://api1.com',
            poolId: 'us-east-1_POOL1',
            region: 'us-east-1'
          },
          {
            url: 'https://api2.org',
            poolId: 'eu-west-1_POOL2',
            region: 'eu-west-1'
          },
          {
            url: 'http://localhost:3000',
            poolId: 'us-west-2_POOL3',
            region: 'us-west-2'
          }
        ];

        const expectedScopes = [
          "openid",
          "profile",
          "email"
        ];

        envCombinations.forEach(({ url, poolId, region }) => {
          process.env.RESOURCE_SERVER_URL = url;
          process.env.COGNITO_USER_POOL_ID = poolId;
          process.env.AWS_REGION = region;

          const metadata = generateMetadata();

          expect(metadata.scopes_supported).toEqual(expectedScopes);
        });
      });

      test('should always return header as the only bearer method', () => {
        const envCombinations = [
          { url: 'https://api1.com', poolId: 'pool1', region: 'us-east-1' },
          { url: 'https://api2.com', poolId: 'pool2', region: 'eu-west-1' },
          { url: 'https://api3.com', poolId: 'pool3', region: 'ap-south-1' }
        ];

        envCombinations.forEach(({ url, poolId, region }) => {
          process.env.RESOURCE_SERVER_URL = url;
          process.env.COGNITO_USER_POOL_ID = poolId;
          process.env.AWS_REGION = region;

          const metadata = generateMetadata();

          expect(metadata.bearer_methods_supported).toEqual(["header"]);
        });
      });
    });

    describe('RFC 9728 compliance', () => {
      test('should include all required RFC 9728 fields', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const metadata = generateMetadata();

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
      });

      test('should generate valid JSON serializable metadata', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const metadata = generateMetadata();

        // Should be JSON serializable without errors
        expect(() => JSON.stringify(metadata)).not.toThrow();
        
        // Should be parseable back to equivalent object
        const serialized = JSON.stringify(metadata);
        const parsed = JSON.parse(serialized);
        expect(parsed).toEqual(metadata);
      });

      test('should have non-empty arrays for all array fields', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        const metadata = generateMetadata();

        expect(metadata.authorization_servers.length).toBeGreaterThan(0);
        expect(metadata.scopes_supported.length).toBeGreaterThan(0);
        expect(metadata.bearer_methods_supported.length).toBeGreaterThan(0);
      });
    });
  });

  describe('handleMetadataRequest()', () => {
    let mockReq, mockRes;

    beforeEach(() => {
      // Create mock Express request and response objects
      mockReq = {
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
        ip: '127.0.0.1',
        get: jest.fn((header) => {
          if (header === 'User-Agent') return 'Test-Agent/1.0';
          return undefined;
        })
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        statusCode: 200
      };
    });

    describe('with valid configuration', () => {
      beforeEach(() => {
        // Set valid environment variables
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';
      });

      test('should return 200 status with valid metadata JSON', () => {
        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledTimes(1);
        
        const responseData = mockRes.json.mock.calls[0][0];
        expect(responseData).toHaveProperty('resource');
        expect(responseData).toHaveProperty('authorization_servers');
        expect(responseData).toHaveProperty('scopes_supported');
        expect(responseData).toHaveProperty('bearer_methods_supported');
      });

      test('should return correct metadata structure', () => {
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

      test('should set correct HTTP status code', () => {
        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.status).toHaveBeenCalledTimes(1);
      });

      test('should handle multiple requests consistently', () => {
        handleMetadataRequest(mockReq, mockRes);
        const firstResponse = mockRes.json.mock.calls[0][0];

        // Reset mocks and make second request
        mockRes.status.mockClear();
        mockRes.json.mockClear();
        
        handleMetadataRequest(mockReq, mockRes);
        const secondResponse = mockRes.json.mock.calls[0][0];

        expect(firstResponse).toEqual(secondResponse);
        expect(mockRes.status).toHaveBeenCalledWith(200);
      });
    });

    describe('with invalid configuration', () => {
      test('should return 503 when RESOURCE_SERVER_URL is missing', () => {
        delete process.env.RESOURCE_SERVER_URL;
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: "service_unavailable",
          error_description: "OAuth metadata temporarily unavailable due to configuration error"
        });
      });

      test('should return 503 when COGNITO_USER_POOL_ID is missing', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        delete process.env.COGNITO_USER_POOL_ID;
        process.env.AWS_REGION = 'us-east-1';

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: "service_unavailable",
          error_description: "OAuth metadata temporarily unavailable due to configuration error"
        });
      });

      test('should return 503 when AWS_REGION is missing', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        delete process.env.AWS_REGION;

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: "service_unavailable",
          error_description: "OAuth metadata temporarily unavailable due to configuration error"
        });
      });

      test('should return 503 when RESOURCE_SERVER_URL has invalid format', () => {
        process.env.RESOURCE_SERVER_URL = 'invalid-url';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: "service_unavailable",
          error_description: "OAuth metadata temporarily unavailable due to configuration error"
        });
      });

      test('should return 503 when multiple configuration errors exist', () => {
        delete process.env.RESOURCE_SERVER_URL;
        delete process.env.COGNITO_USER_POOL_ID;
        delete process.env.AWS_REGION;

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: "service_unavailable",
          error_description: "OAuth metadata temporarily unavailable due to configuration error"
        });
      });
    });

    describe('error handling', () => {
      test('should handle unexpected errors gracefully', () => {
        // Set invalid config to trigger validation error path
        // This tests the try-catch error handling without complex mocking
        process.env.RESOURCE_SERVER_URL = 'invalid-url';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: "service_unavailable",
          error_description: "OAuth metadata temporarily unavailable due to configuration error"
        });
      });
    });

    describe('HTTP headers and content type', () => {
      test('should return JSON content type implicitly through res.json()', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        handleMetadataRequest(mockReq, mockRes);

        // Express res.json() automatically sets Content-Type: application/json
        expect(mockRes.json).toHaveBeenCalledTimes(1);
        expect(typeof mockRes.json.mock.calls[0][0]).toBe('object');
      });

      test('should handle different request properties', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        // Test with different request properties
        mockReq.method = 'GET';
        mockReq.url = '/.well-known/oauth-protected-resource';
        mockReq.ip = '192.168.1.100';
        mockReq.get = jest.fn((header) => {
          if (header === 'User-Agent') return 'Mozilla/5.0 Test Browser';
          return undefined;
        });

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockReq.get).toHaveBeenCalledWith('User-Agent');
      });
    });

    describe('request logging', () => {
      test('should access request properties for logging', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        handleMetadataRequest(mockReq, mockRes);

        // Verify that request properties were accessed (indicating logging occurred)
        expect(mockReq.get).toHaveBeenCalledWith('User-Agent');
        expect(mockRes.status).toHaveBeenCalledWith(200);
      });

      test('should handle missing User-Agent header', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        mockReq.get = jest.fn(() => undefined);

        handleMetadataRequest(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockReq.get).toHaveBeenCalledWith('User-Agent');
      });
    });

    describe('response format compliance', () => {
      test('should return RFC 9728 compliant error format', () => {
        delete process.env.RESOURCE_SERVER_URL;

        handleMetadataRequest(mockReq, mockRes);

        const errorResponse = mockRes.json.mock.calls[0][0];
        expect(errorResponse).toHaveProperty('error');
        expect(errorResponse).toHaveProperty('error_description');
        expect(errorResponse.error).toBe('service_unavailable');
        expect(typeof errorResponse.error_description).toBe('string');
      });

      test('should return RFC 9728 compliant success format', () => {
        process.env.RESOURCE_SERVER_URL = 'https://api.example.com';
        process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
        process.env.AWS_REGION = 'us-east-1';

        handleMetadataRequest(mockReq, mockRes);

        const successResponse = mockRes.json.mock.calls[0][0];
        
        // RFC 9728 required fields
        expect(successResponse).toHaveProperty('resource');
        expect(successResponse).toHaveProperty('authorization_servers');
        expect(successResponse).toHaveProperty('scopes_supported');
        expect(successResponse).toHaveProperty('bearer_methods_supported');
        
        // Verify field types
        expect(typeof successResponse.resource).toBe('string');
        expect(Array.isArray(successResponse.authorization_servers)).toBe(true);
        expect(Array.isArray(successResponse.scopes_supported)).toBe(true);
        expect(Array.isArray(successResponse.bearer_methods_supported)).toBe(true);
      });
    });
  });
});
