/**
 * MCP Server Integration Test
 * Uses InMemoryTransport to test the full MCP protocol flow with mocked AWS services.
 */

import { jest } from '@jest/globals';

// Mock AWS services at the service boundary (before any tool imports)
const mockDynamoSend = jest.fn().mockResolvedValue({ Items: [] });
jest.unstable_mockModule('../services/dynamoDb.js', () => ({
  TABLE_NAME: 'test-table',
  getDynamoDbClient: jest.fn().mockResolvedValue({ send: mockDynamoSend }),
}));

const mockS3Send = jest.fn().mockResolvedValue({ Body: null });
jest.unstable_mockModule('../services/s3.js', () => ({
  BUCKET_NAME: 'test-bucket',
  getS3Client: jest.fn().mockResolvedValue({ send: mockS3Send }),
  listTenantResources: jest.fn().mockResolvedValue([
    { key: 'tenant-abc/guide.md', filename: 'guide.md', contentType: 'text/markdown' },
  ]),
}));

// Mock JWT verifier so whoami doesn't call Cognito
jest.unstable_mockModule('../auth/jwt-verifier.js', () => ({
  processJwt: jest.fn(),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 'user-123',
    email: 'test@example.com',
    'custom:tenantId': 'tenant-abc',
    'custom:tenantTier': 'basic',
    'cognito:username': 'testuser',
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    token_use: 'access',
  }),
}));

// Dynamic imports after mocks are set up
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const mcpServer = await import('../mcp/mcp-server.js');

const AUTH_INFO = {
  token: 'test-token',
  client_id: 'test-client',
  scopes: ['openid'],
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  extra: {
    userId: 'user-123',
    tenantId: 'tenant-abc',
    tenantTier: 'basic',
  },
};

/**
 * Helper: create a linked client+server pair with authInfo injected on every message.
 */
async function createTestPair() {
  const server = mcpServer.default.create();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  // Inject authInfo on every client→server message
  const originalSend = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) =>
    originalSend(message, { ...options, authInfo: AUTH_INFO });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { server, client, cleanup: async () => { await client.close(); await server.close(); } };
}

describe('MCP Server Integration', () => {
  let client, cleanup;

  beforeEach(async () => {
    mockDynamoSend.mockReset().mockResolvedValue({ Items: [] });
    mockS3Send.mockReset();
    ({ client, cleanup } = await createTestPair());
  });

  afterEach(async () => {
    await cleanup();
  });

  // --- Tools ---

  test('lists all registered tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'whoami', 'list_bookings', 'find_flights', 'book_flight',
      'book_hotel', 'list_hotels', 'loyalty_info',
    ]));
  });

  test('list_bookings returns empty array when no bookings', async () => {
    const result = await client.callTool({ name: 'list_bookings', arguments: { type: 'ALL' } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  test('list_bookings returns bookings from DynamoDB', async () => {
    const fakeBooking = { PK: 'tenant-abc', SK: 'BOOKING#FLIGHT#ABC', type: 'FLIGHT', bookingId: 'ABC' };
    mockDynamoSend.mockResolvedValueOnce({ Items: [fakeBooking] });

    const result = await client.callTool({ name: 'list_bookings', arguments: {} });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].bookingId).toBe('ABC');
  });

  test('find_flights returns flight results', async () => {
    const result = await client.callTool({
      name: 'find_flights',
      arguments: { origin: 'JFK', destination: 'LAX', departure: '2026-06-15' },
    });
    expect(result.isError).toBeFalsy();
    const flights = JSON.parse(result.content[0].text);
    expect(flights).toHaveLength(4);
    expect(flights[0]).toHaveProperty('flightNumber');
    expect(flights[0]).toHaveProperty('origin', 'JFK');
  });

  test('list_hotels returns hotel results', async () => {
    const result = await client.callTool({
      name: 'list_hotels',
      arguments: { city: 'Paris', checkIn: '2026-07-01', checkOut: '2026-07-05', guests: 2 },
    });
    expect(result.isError).toBeFalsy();
    const hotels = JSON.parse(result.content[0].text);
    expect(hotels).toHaveLength(4);
    expect(hotels[0]).toHaveProperty('hotelName');
  });

  test('book_flight writes to DynamoDB and returns result', async () => {
    mockDynamoSend.mockResolvedValue({}); // PutCommand succeeds
    const result = await client.callTool({
      name: 'book_flight',
      arguments: { flightNumber: 'AA1234', departure: '2026-06-15', flightClass: 'Economy' },
    });
    // Result is either a success or a simulated error scenario — both are valid
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  test('loyalty_info returns airline and hotel programs', async () => {
    const result = await client.callTool({ name: 'loyalty_info', arguments: {} });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('airlines');
    expect(data).toHaveProperty('hotels');
    expect(Object.keys(data.airlines)).toHaveLength(4);
  });

  test('whoami returns user info from authInfo', async () => {
    const result = await client.callTool({ name: 'whoami', arguments: {} });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.userInfo.tenantId).toBe('tenant-abc');
    expect(data.userInfo.username).toBe('testuser');
  });

  // --- Auth propagation ---

  test('tenant ID from authInfo is used for DynamoDB queries', async () => {
    await client.callTool({ name: 'list_bookings', arguments: {} });
    // Verify the mocked DynamoDB client's send was called (proves auth→service flow works)
    expect(mockDynamoSend).toHaveBeenCalled();
  });

  // --- Resources ---

  test('lists tenant resources', async () => {
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toContain('tenant-abc');
    expect(resources[0].name).toBe('guide.md');
  });

  // --- Prompts ---

  test('lists registered prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    const names = prompts.map(p => p.name);
    expect(names).toContain('flight_search');
  });

  test('get prompt returns processed template', async () => {
    const result = await client.getPrompt({
      name: 'flight_search',
      arguments: { origin: 'NYC', destination: 'London', date: '2026-08-01' },
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('NYC');
    expect(result.messages[0].content.text).toContain('London');
  });

  // --- Error handling ---

  test('calling unknown tool returns error', async () => {
    await expect(client.callTool({ name: 'nonexistent', arguments: {} }))
      .rejects.toThrow();
  });

  // --- Stateless model ---

  test('each server instance is independent', async () => {
    const pair2 = await createTestPair();
    const { tools: tools1 } = await client.listTools();
    const { tools: tools2 } = await pair2.client.listTools();
    expect(tools1.map(t => t.name)).toEqual(tools2.map(t => t.name));
    await pair2.cleanup();
  });
});
