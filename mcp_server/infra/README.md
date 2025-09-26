# MCP Server Infrastructure

CDK infrastructure for deploying the MCP server to AWS. For general project information, see the [top-level README](../README.md).

## Stack Architecture

**MCPServerInfrastructureStack** (`lib/infrastructure-stack.ts`):
- DynamoDB table for travel booking data
- S3 bucket for policy documents  
- IAM roles for secure access
- Cognito User Pool for authentication
- Optional DCR resources for custom Amazon Cognito Dynamic Client Registration

**MCPServerApplicationStack** (`lib/application-stack.ts`):
- ECS Fargate service running the MCP server
- Application Load Balancer with HTTP/HTTPS
- VPC and networking components

## Quick Deployment

```bash
./deploy.sh
```

## OAuth and Dynamic Client Registration (DCR)

When DCR is enabled:

**Additional Resources:**
- API Gateway with CORS and throttling
- Lambda functions for DCR endpoints
- RFC 7591 Dynamic Client Registration
- RFC 8414 OpenID Configuration

**Available Endpoints:**
- `GET /.well-known/openid-configuration` - OpenID Configuration
- `POST /register` - Dynamic Client Registration

**Environment Variables Added:**
```bash
DCR_ENABLED=true
AUTHORIZATION_SERVER_WITH_DCR_URL=https://your-dcr-api.execute-api.region.amazonaws.com/prod
```

## Infrastructure Details

### DynamoDB Configuration
- **Table**: `MCPServerTravelBookings`
- **Keys**: `PK` (partition), `SK` (sort) with tenant prefixing
- **Capacity**: On-demand with point-in-time recovery

### IAM Security
- **Role**: `MCPServerDataAccessRole`
- **Conditions**: `dynamodb:LeadingKeys` for tenant isolation
- **Tagging**: Session tags for tenant context

### Cognito Setup
- Email verification required
- Custom attributes for tenant information
- OAuth 2.0 configuration for hosted UI
- Password policies enforced
- Lambda Handlers for Access Token customization and Tenant Assignment

### ECS Configuration
- **Launch Type**: Fargate (serverless)
- **Auto-scaling**: CPU-based scaling
- **Health Checks**: `/health` endpoint
- **Networking**: Private subnets with NAT gateway

## Cleanup

```bash
# Remove both stacks (application first)
npx cdk destroy MCPServerApplicationStack
npx cdk destroy MCPServerInfrastructureStack

# Or remove all at once
npx cdk destroy --all
```
