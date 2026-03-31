# AGENTS.MD

## Project

Multi-tenant MCP server (TypeScript/Node.js) with OAuth 2.1 auth via Cognito, deployed on ECS. Includes a React MCP client deployed on CloudFront.

## Repo Layout

```
mcp_server/
  src/           # Server source (JS/TS, Express, MCP SDK)
  infra/         # CDK stacks (InfrastructureStack + ApplicationStack)
mcp_client/      # React frontend + Lambda backend
```

## Key Commands

```bash
# Server — build & test
cd mcp_server/src
npm run build          # tsc + copy JS/JSON/dirs to dist/
npm test               # unit/integration tests (vitest)
npm run test:e2e       # e2e against live deployment (needs env vars below)

# Server — deploy
cd mcp_server/infra
npm install
npx cdk deploy --all   # or ./deploy.sh

# Server — container image
cd mcp_server/src
npm run build
finch build --platform linux/amd64 -t <ECR_URI>:latest .
finch push <ECR_URI>:latest

# Client — deploy
cd mcp_client
./deploy.sh
```

## Verification

Before committing or deploying, always run:

```bash
cd mcp_server/src && npm test
```

The unit tests have no external dependencies and run in <1s. Run them after any change to `src/` files.

## E2E Test

Runs the full OAuth 2.1 flow: 401 → WWW-Authenticate → resource metadata → OIDC discovery → DCR → PKCE authorize → automated Cognito login → token exchange → MCP SDK client → all tools.

```bash
MCP_SERVER_URL=https://mc-xxx.ecs.us-east-1.on.aws \
TEST_USERNAME='user+tenant@example.com' \
TEST_PASSWORD='password' \
npm run test:e2e
```

Test user must have signed up via Cognito hosted UI (PostConfirmation Lambda assigns tenantId from email alias).

## CDK Stacks (mcp_server/infra)

- **InfrastructureStack**: Cognito, DynamoDB, S3, IAM roles, DCR Lambda, OpenID Config Lambda
- **ApplicationStack**: ECS Express Gateway service, ECR image reference, execution/infra roles

Cross-stack: ApplicationStack receives resources from InfrastructureStack via props. If you modify a role in InfrastructureStack from ApplicationStack code (e.g. `addToPolicy`), the change lands in InfrastructureStack's template — both stacks need deploying.

CDK Nag (AwsSolutions) is enabled. Suppressions are in `infra/bin/infra.ts`.

## Auth Flow

1. Client → `POST /mcp` → 401 + `WWW-Authenticate: Bearer resource_metadata="..."`
2. Client fetches `/.well-known/oauth-protected-resource` → discovers authorization server
3. Client fetches `/.well-known/openid-configuration` from auth server → endpoints
4. Client registers via DCR (`/register`) → gets client_id
5. Authorization Code + PKCE via Cognito hosted UI → access token with `openid` scope
6. Client → `POST /mcp` with `Authorization: Bearer <token>`

Resource URL in oauth-metadata.js is derived from the request Host header (no config needed).

## Tenant Isolation

- Users sign up as `user+tenantname@example.com` → PostConfirmation Lambda sets `custom:tenantId`
- PreToken Lambda includes tenantId in access token
- Server extracts tenantId from JWT, uses STS session tags for DynamoDB/S3 access
- Isolation enforced at IAM policy level, not application level

## MCP Tools

whoami, find_flights, book_flight, list_hotels, book_hotel, list_bookings, loyalty_info

Tools registered in `mcp_server/src/mcp/mcp-server.js`. Booking tools use Faker for demo data and randomly simulate business errors (payment declined etc.).

## Important Files

- `src/index.js` — Express app entry point
- `src/mcp/mcp-server.js` — MCP tool/resource/prompt registration
- `src/auth/token-middleware.js` — Bearer auth middleware (derives resource URL from request)
- `src/auth/oauth-metadata.js` — RFC 9728 metadata (derives resource URL from request)
- `src/auth/jwt-verifier.js` — Cognito JWT verification
- `infra/lib/infrastructure-stack.ts` — Core AWS resources
- `infra/lib/application-stack.ts` — ECS Express Gateway service
- `infra/bin/infra.ts` — Stack wiring + CDK Nag suppressions

## Gotchas

- If `docker` is not installed, use `finch` as a drop-in replacement for container builds
- `Dockerfile` expects pre-built `dist/` (run `npm run build` first)
- ECS Express Gateway service updates require a new image push + `cdk deploy` or `aws ecs update-service --force-new-deployment`
