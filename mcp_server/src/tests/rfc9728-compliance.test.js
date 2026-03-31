/**
 * RFC 9728 Compliance Validation Tests
 * Verifies adherence to OAuth 2.0 Protected Resource Metadata specification.
 * Only tests unique to RFC compliance that aren't covered by oauth-metadata.test.js.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMetadataRequest } from '../auth/oauth-metadata.js';

describe('RFC 9728 Compliance Validation', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_TEST123456';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function callMetadataEndpoint() {
    const mockReq = {
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
      protocol: 'https',
      ip: '127.0.0.1',
      get: vi.fn((header) => {
        if (header === 'Host') return 'api.example.com';
        if (header === 'X-Forwarded-Proto') return 'https';
        if (header === 'User-Agent') return 'RFC9728-Test/1.0';
        return undefined;
      })
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    return { mockReq, mockRes };
  }

  test('should use valid URI for resource field', () => {
    const { mockReq, mockRes } = callMetadataEndpoint();

    handleMetadataRequest(mockReq, mockRes);
    const metadata = mockRes.json.mock.calls[0][0];

    expect(() => new URL(metadata.resource)).not.toThrow();
    expect(metadata.resource).toMatch(/^https?:\/\//);
  });

  test('should use valid HTTPS URIs for authorization_servers', () => {
    const { mockReq, mockRes } = callMetadataEndpoint();

    handleMetadataRequest(mockReq, mockRes);
    const metadata = mockRes.json.mock.calls[0][0];

    expect(metadata.authorization_servers.length).toBeGreaterThan(0);
    metadata.authorization_servers.forEach(server => {
      expect(() => new URL(server)).not.toThrow();
      expect(server).toMatch(/^https:\/\//);
    });
  });

  test('should not expose sensitive configuration in metadata', () => {
    const { mockReq, mockRes } = callMetadataEndpoint();

    handleMetadataRequest(mockReq, mockRes);
    const metadataString = JSON.stringify(mockRes.json.mock.calls[0][0]);

    expect(metadataString).not.toContain('password');
    expect(metadataString).not.toContain('secret');
    expect(metadataString).not.toContain('key');
    expect(metadataString).not.toContain('token');
  });
});
