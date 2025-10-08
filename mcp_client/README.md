# MCP Playground - Amazon Bedrock Edition

Welcome to the MCP Playground powered by Amazon Bedrock! This project provides a user-friendly interface for interacting with Amazon Bedrock AI models and exploring their capabilities. The playground allows you to connect to Model Context Protocol (MCP) servers, manage AI tools, and run AI models with ease.

## ✨ Features

### 🤖 AI Model Integration
- **Amazon Bedrock Models**: Support for Claude, Llama, and Amazon Nova models
- **Smart Model Selection**: Default to Amazon Nova Lite with intelligent model picker
- **Real-time Streaming**: Stream AI responses for better user experience
- **System Message Configuration**: Customizable system prompts with compact 2-line interface

### 🔗 MCP Server Connectivity
- **Flexible Authentication**: Multiple authentication methods for MCP servers
- **Fast Connection Handling**: Optimized connection timeouts and error handling
- **Tool Management**: View and interact with available MCP tools
- **Connection State Management**: Clear visual feedback for connection status

### 🔐 User Authentication
- **AWS Cognito Integration**: Secure user authentication with JWT tokens
- **Protected Routes**: Application requires user sign-in for access
- **User Management**: CLI tools for creating and managing users
- **Session Management**: Automatic token validation and refresh
- **Secure Token Storage**: Tokens stored in memory only (not localStorage)
- **Optional API Authentication**: Inference endpoints work with or without auth

### 🔐 MCP Server Authentication
- **Manual Bearer Tokens**: Direct token input with visibility toggle
- **Tab-based OAuth Flow**: OAuth authentication opens in new tabs (no popup blockers)
- **OAuth Integration**: Automated OAuth flow with token management
- **Pre-registered OAuth Clients**: Support for client credentials flow
- **Token Copying**: Easy token extraction for external use
- **Smart Authentication**: Auto-cleanup of incomplete auth configurations

### 🎨 Modern UI/UX
- **Responsive Design**: Built with React and Tailwind CSS
- **Interactive Elements**: Eye icons for password visibility, smart button states
- **Real-time Feedback**: Immediate connection status and error reporting
- **Accessibility**: Proper form controls and keyboard navigation
- **Dark/Light Themes**: AI-themed gradients and modern styling
- **User Profile Display**: Username and sign-out button in header

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- AWS account with Bedrock access
- AWS credentials configured

### Quick Start (Recommended)

1. **Clone and Install**:
   ```bash
   git clone <repository-url>
   cd mcp_client
   npm install
   ```

2. **Deploy to AWS** (includes authentication setup):
   ```bash
   ./deploy.sh
   ```

3. **Set Environment Variables and Create Demo Users**:
   Copy and paste the export commands shown after deployment, then run:
   ```bash
   npm run users:demo
   ```

4. **Access Your Deployed Application**:
   - Use the CloudFront URL provided after deployment
   - Sign in with demo credentials:
     - Username: `demo`, Password: `DemoPassword123!`
     - Username: `testuser`, Password: `TestPassword123!`

### Local Development

1. **Clone and Install**:
   ```bash
   git clone <repository-url>
   cd mcp_client
   npm install
   ```

2. **Configure AWS Credentials** (choose one):
   
   **Option A: AWS CLI**
   ```bash
   aws configure
   # Verify: aws sts get-caller-identity
   ```
   
   **Option B: Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials
   ```

3. **Start Development Server**:
   ```bash
   npm start
   ```
   
   This starts both the Express server (port 3001) and React dev server (port 5173).

4. **Access the Application**:
   Open `http://localhost:5173` in your browser.

### Amazon Bedrock Setup

1. **Enable Model Access** in AWS Console → Amazon Bedrock:
   - Amazon Nova models (Lite, Micro, Pro)
   - Anthropic Claude models (3 Haiku, 3 Sonnet, 3.5 Sonnet)
   - Meta Llama models (3.1 8B, 3.1 70B, 3.3 70B)

2. **IAM Permissions**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel",
           "bedrock:InvokeModelWithResponseStream"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

## 🌐 AWS Deployment

Deploy to AWS with our unified deployment script that supports both simple and custom domain deployments.

### Interactive Deployment

```bash
./deploy.sh
```

The script will prompt you to choose:
1. **Simple Deployment**: CloudFront domain only
2. **Custom Domain**: Route53 + CloudFront with SSL

### Deployment Options

**Simple Deployment:**
- Automatic CloudFront distribution
- S3 static hosting
- API Gateway + Lambda backend
- No custom domain required

**Custom Domain Deployment:**
- Route53 hosted zone integration
- ACM SSL certificate (create new or use existing)
- Custom domain configuration
- DNS validation support

**Custom Domain with External DNS:**
- Deploy with CloudFront distribution
- ACM SSL certificate for your domain
- Manual CNAME configuration in external DNS provider
- Works with any DNS provider (GoDaddy, Namecheap, Cloudflare, etc.)

To use this option:
1. Deploy using simple deployment first
2. Create ACM certificate for your domain (requires DNS validation)
3. Redeploy with certificate ARN
4. Configure CNAME record: `your-domain.com` → `d1234567890.cloudfront.net`

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CloudFront Distribution                  │
│  ┌─────────────────┐              ┌─────────────────────────────┐│
│  │   S3 Origin     │              │      API Gateway Origin     ││
│  │  (React App)    │              │       (/api/*, /health)     ││
│  │  (Default)      │              │                             ││
│  └─────────────────┘              └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         │                                        │
         │                                        │
┌─────────────────┐                    ┌─────────────────────────────┐
│   S3 Bucket     │                    │      API Gateway            │
│  Static Files   │                    │  ┌─────────────────────────┐ │
│  - index.html   │                    │  │ /api/inference (POST)   │ │
│  - assets/      │                    │  │ /api/mcp-proxy/{proxy+} │ │
│  - favicon.ico  │                    │  │ /api/auth/* (GET/POST)  │ │
└─────────────────┘                    │  │ /health (GET)           │ │
                                       │  └─────────────────────────┘ │
                                       └─────────────────────────────┘
                                                    │
                                       ┌─────────────────────────────┐
                                       │      Lambda Function        │
                                       │  - Bedrock AI Integration   │
                                       │  - MCP Server Proxy         │
                                       │  - JWT Authentication       │
                                       │  - CORS Handling            │
                                       └─────────────────────────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              │                     │                     │
                    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
                    │  Amazon Bedrock │   │  Cognito User   │   │  External MCP   │
                    │  - Claude       │   │  Pool + Client  │   │  Servers        │
                    │  - Nova         │   │  - JWT Tokens   │   │  - Tool Access  │
                    │  - Llama        │   │  - User Auth    │   │  - OAuth Flow   │
                    └─────────────────┘   └─────────────────┘   └─────────────────┘

Optional Custom Domain:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Route53       │────│  ACM Certificate│────│   CloudFront    │
│  Hosted Zone    │    │  SSL/TLS        │    │  Distribution   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎯 Available Models

### Amazon Nova Models
- **Nova Lite** (default): Fast, efficient multimodal tasks
- **Nova Micro**: Lightweight text generation
- **Nova Pro**: Advanced reasoning and complex tasks

### Anthropic Claude Models
- **Claude 3 Haiku**: Fast, cost-effective
- **Claude 3 Sonnet**: Balanced performance
- **Claude 3.5 Sonnet**: Latest, most capable

### Meta Llama Models
- **Llama 3.1 8B**: Efficient, fast responses
- **Llama 3.1 70B**: High-quality reasoning
- **Llama 3.3 70B**: Latest Llama model

## 🔧 Usage Guide

### Model Selection
1. Click the model dropdown to see available models
2. Search by typing in the dropdown
3. Select your preferred model
4. Model selection persists across sessions

### MCP Server Connection

**Basic Connection:**
1. Enter MCP server URL
2. Click "Connect"
3. Use "Cancel" to abort connection attempts

**Manual Authentication:**
1. Check "Use Manual Authentication"
2. Enter bearer token (use eye icon to toggle visibility)
3. Click "Connect"

**OAuth Authentication:**
1. Check "Use Pre-registered OAuth Client"
2. Enter Client ID and Client Secret
3. Click "Connect" for automated OAuth flow
4. OAuth authentication opens in a new browser tab (bypasses popup blockers)
5. Complete authentication in the new tab
6. Return to the main application - connection will be established automatically

### System Messages
- Configure AI behavior with system prompts
- Compact 2-line interface with scroll for longer messages
- Persists across sessions

## 👥 User Management

### Creating Users

After deployment, create users using the management scripts:

```bash
# Create demo users (recommended for testing)
COGNITO_USER_POOL_ID=$(grep COGNITO_USER_POOL_ID .env | cut -d'=' -f2) \
COGNITO_REGION=$(grep COGNITO_REGION .env | cut -d'=' -f2) \
npm run users:demo

# Create a specific user
COGNITO_USER_POOL_ID=$(grep COGNITO_USER_POOL_ID .env | cut -d'=' -f2) \
COGNITO_REGION=$(grep COGNITO_REGION .env | cut -d'=' -f2) \
npm run users:create <username> <email> <password>

# List all users
COGNITO_USER_POOL_ID=$(grep COGNITO_USER_POOL_ID .env | cut -d'=' -f2) \
COGNITO_REGION=$(grep COGNITO_REGION .env | cut -d'=' -f2) \
npm run users:list

# Delete a user
COGNITO_USER_POOL_ID=$(grep COGNITO_USER_POOL_ID .env | cut -d'=' -f2) \
COGNITO_REGION=$(grep COGNITO_REGION .env | cut -d'=' -f2) \
npm run users:delete <username>
```

**Demo Users:**
- Username: `demo`, Password: `DemoPassword123!`
- Username: `testuser`, Password: `TestPassword123!`

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter  
- At least one number
- At least one special character

### Authentication Flow

1. User enters credentials in login form
2. Frontend authenticates with Cognito
3. Cognito returns JWT tokens (access + ID)
4. Tokens stored securely in browser memory
5. API calls include Bearer token in Authorization header
6. Backend validates JWT against Cognito JWKS

## 🛠️ Development

### Available Scripts
- `npm start` - Full development environment
- `npm run dev:client` - React dev server only
- `npm run dev:server` - Express server only
- `npm run build` - Production build
- `npm run type-check` - TypeScript validation
- `npm run test` - Run tests
- `npm run users:demo` - Create demo users for testing
- `npm run users:create` - Create a specific user
- `npm run users:list` - List all users in Cognito
- `npm run users:delete` - Delete a user from Cognito

### Project Structure
```
src/
├── components/          # React components
├── hooks/              # Custom React hooks
├── lib/                # Utility libraries
├── models/             # Model configurations
└── styles/             # CSS and styling
```

### Key Technologies
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Express.js, AWS SDK
- **AI Integration**: Vercel AI SDK, Amazon Bedrock
- **Deployment**: AWS CDK, CloudFormation

## 🔒 Security Features

### Authentication Security
- **JWT Token Validation**: Tokens verified against Cognito JWKS
- **Secure Token Storage**: Tokens stored in memory only (not localStorage)
- **Token Type Validation**: Ensures proper access vs ID token usage
- **Automatic Token Expiration**: Handles token refresh and expiration
- **Protected Routes**: Application requires authentication for access

### Application Security
- **CORS Protection**: Proper CORS configuration for API endpoints
- **Input Validation**: Client and server-side validation
- **Error Handling**: Secure error messages without sensitive data exposure
- **Authentication Timeouts**: Fast-fail for invalid credentials
- **Optional API Authentication**: Flexible authentication for different endpoints

For detailed authentication setup and troubleshooting, see [Authentication Guide](docs/AUTHENTICATION.md).

---

This client implementation draws inspiration from another example [reachable here.](https://github.com/cloudflare/ai/tree/main/playground/ai)
