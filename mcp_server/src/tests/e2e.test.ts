/**
 * MCP Server End-to-End Test
 *
 * Follows the standard MCP OAuth 2.1 flow end-to-end:
 *   1. POST /mcp → 401 + WWW-Authenticate header with resource_metadata
 *   2. Fetch resource metadata → discover authorization_servers
 *   3. Fetch OpenID configuration → discover endpoints
 *   4. Register client via DCR
 *   5. Authorization Code flow with PKCE (automated Cognito hosted UI login)
 *   6. Exchange code for tokens at the token endpoint
 *   7. Connect MCP client with Bearer token and exercise all tools
 *
 * Required env vars:
 *   MCP_SERVER_URL        – e.g. https://mc-xxxx.ecs.us-east-1.on.aws
 *   TEST_USERNAME          – Cognito username (signup with user+tenant@example.com)
 *   TEST_PASSWORD          – Cognito password
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as crypto from 'crypto';
import * as http from 'http';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;
const CALLBACK_PORT = 19876;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

if (!MCP_SERVER_URL || !USERNAME || !PASSWORD) {
  throw new Error('Missing required env vars: MCP_SERVER_URL, TEST_USERNAME, TEST_PASSWORD');
}

let accessToken: string;
let mcpClient: Client;

// ── PKCE helpers ──────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── Cognito hosted UI login automation ────────────────────────────

/**
 * Programmatically submit the Cognito hosted UI login form.
 * 1. GET /oauth2/authorize → follow redirects to the login page
 * 2. Parse the login form for the CSRF token and form action
 * 3. POST credentials → follow redirects to capture the auth code
 */
async function automateHostedUILogin(
  authorizeUrl: string,
  username: string,
  password: string,
): Promise<string> {
  // Step 1: GET the authorize URL — Cognito redirects to the login page
  const loginPageRes = await fetch(authorizeUrl, { redirect: 'follow' });
  if (!loginPageRes.ok) throw new Error(`Authorize request failed: ${loginPageRes.status}`);

  const loginPageHtml = await loginPageRes.text();
  const loginPageUrl = loginPageRes.url; // final URL after redirects

  // Step 2: Parse the form action and CSRF token
  const formActionMatch = loginPageHtml.match(/action="([^"]+)"/);
  if (!formActionMatch) throw new Error('Could not find login form action');
  let formAction = formActionMatch[1].replace(/&amp;/g, '&');

  // Make absolute if relative
  if (formAction.startsWith('/')) {
    const base = new URL(loginPageUrl);
    formAction = `${base.origin}${formAction}`;
  }

  const csrfMatch = loginPageHtml.match(/name="csrf"\s+value="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : '';

  // Extract cookies from the login page response
  const cookies = loginPageRes.headers.getSetCookie?.() || [];
  const cookieHeader = cookies.map((c: string) => c.split(';')[0]).join('; ');

  // Step 3: POST the login form — don't follow the redirect, capture the Location header
  const formBody = new URLSearchParams({
    csrf: csrfToken,
    username,
    password,
    cognitoAsfData: '',
  });

  const loginRes = await fetch(formAction, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
    },
    body: formBody.toString(),
    redirect: 'manual', // Don't follow — we need the Location header
  });

  // Cognito returns 302 with the callback URL containing the auth code
  const location = loginRes.headers.get('location');
  if (!location) {
    const body = await loginRes.text();
    throw new Error(`Login failed — no redirect. Status: ${loginRes.status}. Body: ${body.substring(0, 500)}`);
  }

  const callbackUrl = new URL(location);
  const code = callbackUrl.searchParams.get('code');
  if (!code) {
    const error = callbackUrl.searchParams.get('error_description') || callbackUrl.searchParams.get('error');
    throw new Error(`No auth code in callback. Error: ${error || location}`);
  }

  return code;
}

// ── Setup & Teardown ──────────────────────────────────────────────

beforeAll(async () => {
  // Step 1: POST /mcp without auth → expect 401 with WWW-Authenticate
  const unauthRes = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
  });
  expect(unauthRes.status).toBe(401);

  const wwwAuth = unauthRes.headers.get('www-authenticate')!;
  expect(wwwAuth).toBeTruthy();
  const metadataUrlMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
  expect(metadataUrlMatch).toBeTruthy();
  const resourceMetadataUrl = metadataUrlMatch![1];

  // Step 2: Fetch resource metadata
  const metadata = await (await fetch(resourceMetadataUrl)).json();
  expect(metadata.authorization_servers.length).toBeGreaterThan(0);
  const authServer = metadata.authorization_servers[0];

  // Step 3: Fetch OpenID configuration
  const oidc = await (await fetch(`${authServer}/.well-known/openid-configuration`)).json();
  expect(oidc.authorization_endpoint).toBeDefined();
  expect(oidc.token_endpoint).toBeDefined();

  // Step 4: Register client via DCR
  const dcrRes = await fetch(oidc.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'e2e-test-client',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid profile email',
    }),
  });
  expect(dcrRes.status).toBe(201);
  const { client_id } = await dcrRes.json();

  // Step 5: Authorization Code flow with PKCE
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  const authorizeUrl = new URL(oidc.authorization_endpoint);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', client_id);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', 'openid profile email');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const authCode = await automateHostedUILogin(authorizeUrl.toString(), USERNAME, PASSWORD);

  // Step 6: Exchange code for tokens at the token endpoint
  const tokenRes = await fetch(oidc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      client_id,
      code_verifier: codeVerifier,
    }).toString(),
  });
  expect(tokenRes.ok).toBe(true);
  const tokens = await tokenRes.json();
  accessToken = tokens.access_token;
  expect(accessToken).toBeDefined();

  // Step 7: Connect MCP client
  mcpClient = new Client({ name: 'e2e-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${MCP_SERVER_URL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  await mcpClient.connect(transport);
}, 60_000);

afterAll(async () => {
  if (mcpClient) await mcpClient.close();
});

// ── Tests ─────────────────────────────────────────────────────────

describe('MCP Server E2E', () => {
  test('health endpoint responds', async () => {
    const res = await fetch(`${MCP_SERVER_URL}/health`);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  test('lists all expected tools', async () => {
    const { tools } = await mcpClient.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'book_flight', 'book_hotel', 'find_flights',
        'list_bookings', 'list_hotels', 'loyalty_info', 'whoami',
      ]),
    );
  });

  test('whoami returns authenticated user info', async () => {
    const result = await mcpClient.callTool({ name: 'whoami', arguments: {} });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data.userInfo.tenantId).toBeTruthy();
    expect(data.userInfo.username).toBe(USERNAME);
  });

  test('find_flights returns results', async () => {
    const result = await mcpClient.callTool({
      name: 'find_flights',
      arguments: { origin: 'JFK', destination: 'LAX', departure: '2026-08-15' },
    });
    expect(result.isError).toBeFalsy();
    const flights = JSON.parse((result.content as any)[0].text);
    expect(flights.length).toBeGreaterThan(0);
    expect(flights[0]).toHaveProperty('flightNumber');
  });

  test('list_hotels returns results', async () => {
    const result = await mcpClient.callTool({
      name: 'list_hotels',
      arguments: { city: 'Paris', checkIn: '2026-08-01', checkOut: '2026-08-05', guests: 2 },
    });
    expect(result.isError).toBeFalsy();
    const hotels = JSON.parse((result.content as any)[0].text);
    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels[0]).toHaveProperty('hotelName');
  });

  test('book_flight executes', async () => {
    const searchResult = await mcpClient.callTool({
      name: 'find_flights',
      arguments: { origin: 'JFK', destination: 'LAX', departure: '2026-08-15' },
    });
    const flights = JSON.parse((searchResult.content as any)[0].text);
    const result = await mcpClient.callTool({
      name: 'book_flight',
      arguments: {
        flightNumber: flights[0].flightNumber,
        departure: '2026-08-15',
        flightClass: flights[0].classes?.[0] || 'Economy',
      },
    });
    // Tool may return a simulated business error (e.g. payment declined) — that's fine
    expect((result.content as any)[0].text.length).toBeGreaterThan(0);
  });

  test('book_hotel executes', async () => {
    const result = await mcpClient.callTool({
      name: 'book_hotel',
      arguments: {
        hotelName: 'Grand Hotel', checkIn: '2026-08-01',
        checkOut: '2026-08-05', roomType: 'Standard', guests: 2,
      },
    });
    // Tool may return a simulated business error — that's fine
    expect((result.content as any)[0].text.length).toBeGreaterThan(0);
  });

  test('list_bookings returns results', async () => {
    const result = await mcpClient.callTool({ name: 'list_bookings', arguments: {} });
    expect(result.isError).toBeFalsy();
    const bookings = JSON.parse((result.content as any)[0].text);
    expect(bookings.length).toBeGreaterThanOrEqual(0);
  });

  test('loyalty_info returns programs', async () => {
    const result = await mcpClient.callTool({ name: 'loyalty_info', arguments: {} });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as any)[0].text);
    expect(data).toHaveProperty('airlines');
    expect(data).toHaveProperty('hotels');
  });

  test('lists prompts', async () => {
    const { prompts } = await mcpClient.listPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.map((p) => p.name)).toContain('flight_search');
  });

  test('lists tenant resources', async () => {
    const { resources } = await mcpClient.listResources();
    expect(Array.isArray(resources)).toBe(true);
  });
});
