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
│   ├── oauth-integration.test.js
│   ├── rfc9728-compliance.test.js
│   └── ...
└── scripts/              # Build and deployment scripts
    ├── buildDockerImage.sh
    ├── pushDockerImage.sh
    └── oauth_flow_unified.cjs
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
   RESOURCE_SERVER_URL=http://localhost:3000
   
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

```bash
# Build Docker image
./scripts/buildDockerImage.sh
```


## OAuth Flow Testing

### Complete OAuth 2.1 Flow Test

```bash
# Set MCP server URL
export MCP_SERVER_URL=https://your-mcp-server.com

# Run unified OAuth flow test
./scripts/oauth_flow_unified.cjs
```

This script tests:
- Protected Resource Discovery (RFC 9728)
- Authorization Server Configuration Discovery
- Dynamic Client Registration (if enabled)
- Authorization Code Flow with browser interaction
- Token Exchange and MCP Server Integration

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TABLE_NAME` | DynamoDB table name | `MCPServerTravelBookings` |
| `BUCKET_NAME` | S3 bucket for policies | `mcpserver-policy-bucket-xyz` |
| `ROLE_ARN` | IAM role for AWS access | `arn:aws:iam::123456789012:role/MCPServerRole` |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | `us-east-1_ABCDEF123` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `RESOURCE_SERVER_URL` | OAuth resource server URL | `https://api.example.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Node environment | `development` |
| `DCR_ENABLED` | Enable OAuth proxy mode | `false` |
| `AUTHORIZATION_SERVER_WITH_DCR_URL` | OAuth proxy URL | None |
| `LOG_LEVEL` | Logging level | `info` |

