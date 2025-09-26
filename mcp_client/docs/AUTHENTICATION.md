# Authentication Setup Guide

This guide explains how to set up and use the Cognito authentication system integrated into the MCP Playground.

## Overview

The MCP Playground includes user authentication using AWS Cognito, providing:
- User sign-in/sign-out functionality
- JWT token-based authentication
- Protected routes and API endpoints
- User session management

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React App     │────│   Express API    │────│   AWS Cognito   │
│   (Frontend)    │    │   (Backend)      │    │   (Auth)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    ┌─────────┐            ┌─────────┐            ┌─────────┐
    │ Auth    │            │ JWT     │            │ User    │
    │ Context │            │ Verify  │            │ Pool    │
    └─────────┘            └─────────┘            └─────────┘
```

## Setup Instructions

### 1. Deploy with Cognito

The authentication system is automatically deployed when you use the CDK deployment:

```bash
./deploy.sh
```

This creates:
- Cognito User Pool for user management
- Cognito Identity Pool for AWS resource access
- IAM roles for authenticated/unauthenticated users
- Lambda environment variables for Cognito configuration

### 2. Create Test Users

After deployment, create test users using the management script:

```bash
# Create demo users (recommended for testing)
npm run users:demo

# Create a specific user
npm run users:create <username> <email> <password>

# List all users
npm run users:list

# Delete a user
npm run users:delete <username>
```

**Demo Users Created:**
- Username: `demo`, Password: `DemoPassword123!`
- Username: `testuser`, Password: `TestPassword123!`

### 3. Environment Variables

The following environment variables are automatically set by the CDK deployment:

```bash
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=us-east-1
```

For local development, these are loaded from the deployed Lambda function's environment.

## Usage

### Frontend Authentication

The React app automatically handles authentication:

1. **Protected Routes**: The main application is wrapped in `ProtectedRoute`
2. **Auth Context**: Global authentication state via `AuthProvider`
3. **Login Component**: Automatic login form when not authenticated
4. **User Display**: Username and sign-out button in the header

### API Authentication

Backend endpoints support optional authentication:

- **Public Endpoints**: `/api/inference` works without authentication
- **Auth Endpoints**: `/api/auth/*` for authentication management
- **Protected Endpoints**: Can be added using `authenticateToken` middleware

### Authentication Flow

1. User enters credentials in login form
2. Frontend calls Cognito authentication
3. Cognito returns JWT tokens (access + ID tokens)
4. Tokens stored in browser memory (not localStorage for security)
5. API calls include Bearer token in Authorization header
6. Backend validates JWT against Cognito JWKS

## API Endpoints

### Authentication Endpoints

- `GET /api/auth/config` - Get Cognito configuration
- `GET /api/auth/user` - Get current user info (requires auth)
- `POST /api/auth/validate` - Validate current token (requires auth)

### Example API Usage

```javascript
// Get auth config
const config = await fetch('/api/auth/config').then(r => r.json());

// Make authenticated request
const response = await fetch('/api/auth/user', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

## Security Features

### JWT Token Validation
- Tokens verified against Cognito JWKS
- Issuer validation
- Token type validation (access vs ID tokens)
- Automatic token expiration handling

### Frontend Security
- Tokens stored in memory only (not localStorage)
- Automatic sign-out on token expiration
- HTTPS enforcement in production
- CORS protection

### Backend Security
- JWT signature verification
- Token type validation
- Optional authentication for flexibility
- Secure error handling

## User Management

### Creating Users

```bash
# Interactive creation
npm run users:create john john@example.com MyPassword123!

# Temporary password (user must change on first login)
node scripts/manage-users.js create jane jane@example.com TempPass123! true
```

### Password Requirements

Cognito enforces the following password policy:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### User Attributes

Users have the following attributes:
- `username` - Unique identifier
- `email` - Email address (verified)
- `email_verified` - Always set to true for admin-created users

## Troubleshooting

### Common Issues

1. **"Authentication not configured"**
   - Ensure CDK deployment completed successfully
   - Check that environment variables are set

2. **"Invalid or expired token"**
   - Token may have expired (default 1 hour)
   - User needs to sign in again

3. **"User does not exist"**
   - Create users using the management script
   - Check username spelling

4. **CORS errors**
   - Ensure frontend and backend are running on correct ports
   - Check CORS configuration in server

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
DEBUG=cognito:* npm start
```

### Logs

Check authentication logs:
- Browser console for frontend issues
- Server console for backend JWT validation
- CloudWatch logs for deployed Lambda function

## Development

### Local Development

1. Start the development server:
   ```bash
   npm start
   ```

2. Create test users:
   ```bash
   npm run users:demo
   ```

3. Access the application at `http://localhost:5173`

### Testing Authentication

1. Try accessing the app without signing in (should show login form)
2. Sign in with demo credentials
3. Verify user info appears in header
4. Test sign out functionality
5. Try invalid credentials (should show error)

### Adding Protected Endpoints

```typescript
import { authenticateToken } from './auth-middleware.js';

// Protected endpoint
app.get('/api/protected', authenticateToken, (req: any, res) => {
  res.json({ 
    message: 'This is protected',
    user: req.user 
  });
});

// Optional auth endpoint
app.get('/api/optional', optionalAuth, (req: any, res) => {
  const message = req.user 
    ? `Hello ${req.user.username}!` 
    : 'Hello anonymous user!';
  
  res.json({ message });
});
```

## Production Considerations

### Security
- Use HTTPS in production
- Set secure cookie flags
- Implement rate limiting
- Monitor authentication attempts

### Scalability
- Cognito scales automatically
- Consider caching JWKS responses
- Monitor token validation performance

### Monitoring
- Set up CloudWatch alarms for authentication failures
- Monitor user pool metrics
- Track token validation errors

---

For more information, see the [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/).
