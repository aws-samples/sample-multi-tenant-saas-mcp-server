# MCP Server Implementation

Source code for the Model Context Protocol server with OAuth 2.1 authentication and multi-tenant travel booking tools.

## Directory Structure

```
src/
├── index.js              # Application entry point
├── mcp/                  # MCP protocol implementation
│   ├── mcp-server.js     # MCP server and tool registration
│   ├── transport.js      # HTTP transport with authentication
│   └── mcp-errors.js     # MCP error handling
├── auth/                 # Authentication and authorization
│   ├── jwt-verifier.js   # JWT verification with Cognito
│   ├── oauth-metadata.js # OAuth metadata handling
│   └── token-middleware.js # Token validation middleware
├── utils/                # Utility functions
│   ├── env-config.ts     # Environment configuration
│   ├── metadata.ts       # Metadata utilities
│   └── logging.ts        # Logging utilities
├── resources/            # MCP resources (travel policies)
├── tools/                # MCP tools (booking, search, etc.)
├── services/             # Internal services
├── types/                # TypeScript definitions
├── prompts/              # Prompt templates
│   ├── prompts.js        # Prompt handling
│   └── templates.json    # Prompt templates
├── tests/                # Test files
│   ├── e2e.test.ts       # End-to-end test (full OAuth + MCP tools)
│   ├── mcp-server-integration.test.js
│   ├── oauth-metadata.test.js
│   ├── rfc9728-compliance.test.js
│   └── ...
└── scripts/              # Build and deployment scripts
    ├── buildDockerImage.sh
    └── pushDockerImage.sh
```

## Available Tools

| Tool  | Description |
|------|-------------|
| `whoami`  | User info and authentication status |
| `listFlights`  | Search available flights |
| `bookFlight`  | Book a flight |
| `listHotels`  | Search available hotels |
| `bookHotel`  | Book a hotel room |
| `modifyHotelBooking`  | Modify existing hotel booking |
| `listBookings`  | View existing bookings |
| `getLoyaltyProgramInfo` | Loyalty program information |

## Authentication Implementation

### OAuth 2.1 Flow

1. **Unauthenticated Request** → 401 with `WWW-Authenticate` header
2. **Metadata Discovery** → `GET /.well-known/oauth-protected-resource`
3. **Token Acquisition** → Client gets token from Cognito
4. **Authenticated Request** → `Authorization: Bearer <token>`

### Multi-Tenant Security

- **Tenant ID**: Extracted from JWT `custom:tenantId` claim
- **Data Isolation**: DynamoDB partition keys prefixed with tenant ID
- **STS Tagging**: AWS credentials tagged with tenant context
- **Scope Validation**: Tools check required OAuth scopes

## Local Environment Setup

1. **Deploy Infrastructure**:
   ```bash
   cd ../infra
   ./deploy.sh --infrastructure-only
   ```

2. **Create Environment File**:
   ```bash
   # Required variables
   cat > .env << EOF
   TABLE_NAME=MCPServerTravelBookings
   BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name MCPServerInfrastructureStack --query "Stacks[0].Outputs[?OutputKey=='MCPServerPolicyBucketName'].OutputValue" --output text)
   ROLE_ARN=$(aws cloudformation describe-stacks --stack-name MCPServerInfrastructureStack --query "Stacks[0].Outputs[?OutputKey=='MCPServerDataAccessRoleArn'].OutputValue" --output text)
   COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name MCPServerInfrastructureStack --query "Stacks[0].Outputs[?OutputKey=='MCPServerUserPoolId'].OutputValue" --output text)
   AWS_REGION=us-east-1
   
   # Optional: OAuth proxy mode
   # DCR_ENABLED=true
   # AUTHORIZATION_SERVER_WITH_DCR_URL=https://your-dcr-api.execute-api.region.amazonaws.com/prod
   EOF
   ```

3. **Run Locally**:
   ```bash
   npm install
   npm start
   ```

## Docker Image Management

### Building Locally

The Dockerfile copies a pre-built `dist/` directory rather than building inside the container. This avoids slow x86 emulation when building `linux/amd64` images on ARM Macs, since ECS Express Mode uses x86 by default.

```bash
# Build the app first — Dockerfile expects pre-built dist/
npm run build

# Build and push container image (use finch if docker is not installed)
finch build --platform linux/amd64 -t <ECR_URI>:latest .
finch push <ECR_URI>:latest
```


## Testing

### Unit & Integration Tests

```bash
npm test
```

### End-to-End Test

Runs the full MCP OAuth 2.1 flow against a live deployment:

1. `POST /mcp` → 401 with `WWW-Authenticate` header (RFC 9728)
2. Discovers protected resource metadata and authorization server
3. Fetches OpenID configuration
4. Registers a client via Dynamic Client Registration (RFC 7591)
5. Completes Authorization Code flow with PKCE (automated Cognito hosted UI login)
6. Exchanges code for tokens at the token endpoint
7. Connects the MCP SDK client and exercises all tools, prompts, and resources

```bash
MCP_SERVER_URL=https://your-mcp-server.com \
TEST_USERNAME='user+tenant@example.com' \
TEST_PASSWORD='YourPassword!' \
npm run test:e2e
```

The test user needs a `tenantId` assigned (normally done by the PostConfirmation Lambda during hosted UI signup). For testing, use the helper script which creates the user and triggers the Lambda:

```bash
node scripts/create-test-user.js <email> <password>
# Example: node scripts/create-test-user.js testuser+acme@example.com 'MyPassword1!'
```

Use an email like `yourname+tenantname@example.com` — the alias (`tenantname`) becomes the tenant ID.

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TABLE_NAME` | DynamoDB table name | `MCPServerTravelBookings` |
| `BUCKET_NAME` | S3 bucket for policies | `mcpserver-policy-bucket-xyz` |
| `ROLE_ARN` | IAM role for AWS access | `arn:aws:iam::123456789012:role/MCPServerRole` |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | `us-east-1_ABCDEF123` |
| `AWS_REGION` | AWS region | `us-east-1` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Node environment | `development` |
| `DCR_ENABLED` | Enable OAuth proxy mode | `false` |
| `AUTHORIZATION_SERVER_WITH_DCR_URL` | OAuth proxy URL | None |
| `LOG_LEVEL` | Logging level | `info` |

