# Multi-Tenant (SaaS) MCP Server Sample

This repository contains a multi-tenant remote MCP server implementation using the Streamable HTTP transport written with the TypeScript SDK. The repository also includes an MCP client UI implementation that communicates with Amazon Bedrock, supporting remote MCP servers and AWS hosting.

## MCP Server

A remote MCP server implementation for B2B travel booking with multi-tenant authentication and authorization via Amazon Cognito and OAuth 2.1.

- Node.js with Express and MCP SDK for tools, resources and prompts
- AWS services: ECS, DynamoDB, S3, Cognito
- Protected Metadata Resource handling (**RFC 9728**)
- Multi-tenant architecture with data isolation
- Dynamic client registration (**RFC 7591**)
- OpenID Configuration endpoint to advertise the registration endpoint (**RFC 8414**)

![Architecture Overview Server](/resources/mcp-server-high-level.png)

For a detailed architecture overview, see the [MCP Server README](./mcp_server/README.md).

### Quick Start with MCP Server

```bash
# Deploy the MCP server
cd mcp_server/infra
npm install
./deploy.sh 
```

## MCP Client Implementation

An Amazon Bedrock powered MCP client implementation that allows the management of remote MCP servers and supports different authentication and authorization methods. 

- **Architecture**: React frontend with AWS Lambda backend
- **Security**: AWS Cognito authentication with comprehensive security scanning
- **Deployment**: CloudFront CDN with S3 hosting and API Gateway
- **Features**: Dynamic MCP server management, OAuth integration, Amazon Bedrock AI models, real-time streaming and MCP tools, resources and prompts

![Client example](/resources/client.png)

For a detailed architecture overview, see the [Client README](./mcp_client/README.md)

### Quick Start with MCP Client

```bash
# Deploy the MCP client
cd mcp_client
./deploy.sh
```

## Security

This repository is for demonstration and reference purposes only. The code and configurations provided are not intended for production use without proper review, testing, and security considerations.

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
