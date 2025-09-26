import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateManagedLoginBrandingCommand,
  DescribeUserPoolClientCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const cognito = new CognitoIdentityProviderClient({});
const dynamodb = new DynamoDBClient({});

// Helper function to create composite key with base64 encoded URIs
function createClientKey(clientName, redirectUris) {
  const sortedUris = [...redirectUris].sort().join(',');
  const encodedUris = Buffer.from(sortedUris).toString('base64url');
  return `${clientName}#${encodedUris}`;
}

// Find existing public client in DynamoDB
async function findExistingPublicClient(redirectUris, clientName) {
  try {
    const clientKey = createClientKey(clientName, redirectUris);
    
    const getCommand = new GetItemCommand({
      TableName: process.env.PUBLIC_CLIENTS_TABLE,
      Key: marshall({ clientKey })
    });
    
    const result = await dynamodb.send(getCommand);
    
    if (result.Item) {
      const item = unmarshall(result.Item);
      
      // Get full client details from Cognito
      const describeCmd = new DescribeUserPoolClientCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        ClientId: item.clientId
      });
      
      const cognitoResult = await cognito.send(describeCmd);
      return cognitoResult.UserPoolClient;
    }
    
    return null;
  } catch (error) {
    console.log('Error finding existing public client:', error);
    return null;
  }
}

// Store new public client in DynamoDB
async function storePublicClient(clientName, redirectUris, clientId) {
  try {
    const clientKey = createClientKey(clientName, redirectUris);
    
    const item = {
      clientKey,
      clientId,
      createdAt: new Date().toISOString()
    };
    
    const putCommand = new PutItemCommand({
      TableName: process.env.PUBLIC_CLIENTS_TABLE,
      Item: marshall(item)
    });
    
    await dynamodb.send(putCommand);
    console.log(`Stored public client: ${clientId}`);
  } catch (error) {
    console.log('Error storing public client:', error);
    // Don't throw - client creation succeeded, storage is optimization
  }
}

export const handler = async (event) => {
  try {
    // Validate HTTP method
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'invalid_request', error_description: 'Only POST method is allowed' });
    }

    // Validate Content-Type
    const contentType = event.headers['Content-Type'] || event.headers['content-type'];
    if (contentType !== 'application/json') {
      return jsonResponse(400, { error: 'invalid_request', error_description: 'Content-Type must be application/json' });
    }

    const body = JSON.parse(event.body || '{}');

    if (!process.env.COGNITO_USER_POOL_ID) {
      return jsonResponse(500, { error: 'server_error', error_description: 'Server configuration error' });
    }

    // Extract client metadata per RFC 7591
    const {
      redirect_uris,
      client_name,
      token_endpoint_auth_method = 'none',
      grant_types = ['authorization_code'],
      response_types = ['code'],
      scope,
      contacts,
      logo_uri,
      client_uri,
      policy_uri,
      tos_uri,
      jwks_uri,
      jwks,
      software_id,
      software_version,
      ...extensionParams
    } = body;

    // Extract internationalized client names
    const i18nNames = {};
    Object.keys(body).forEach(key => {
      if (key.startsWith('client_name#')) {
        i18nNames[key] = body[key];
      }
    });

    // Validate required redirect_uris
    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return jsonResponse(400, {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris is required and must be a non-empty array'
      });
    }

    // Validate redirect URIs format
    for (const uri of redirect_uris) {
      try {
        new URL(uri);
        if (!uri.startsWith('https://') && !uri.startsWith('http://localhost')) {
          return jsonResponse(400, {
            error: 'invalid_redirect_uri',
            error_description: 'redirect_uris must use HTTPS or localhost'
          });
        }
      } catch {
        return jsonResponse(400, {
          error: 'invalid_redirect_uri',
          error_description: `Invalid URI format: ${uri}`
        });
      }
    }

    // Validate grant_types and response_types compatibility
    if (grant_types.includes('authorization_code') && !response_types.includes('code')) {
      return jsonResponse(400, {
        error: 'invalid_client_metadata',
        error_description: 'authorization_code grant requires code response_type'
      });
    }

    // Check for existing client using DynamoDB (secure - only public clients)
    const existingClient = await findExistingPublicClient(redirect_uris, client_name);
    
    let userPoolClient;
    if (existingClient) {
      console.log('Returning existing client:', existingClient.ClientId);
      userPoolClient = existingClient;
    } else {
      console.log("Creating new client");
      // Create new Cognito client (public client only)
      const createCmd = new CreateUserPoolClientCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        ClientName: client_name || 'OAuth Dynamic Client',
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: grant_types.includes('authorization_code') ? ['code'] : [],
        AllowedOAuthScopes: scope ? scope.split(' ') : ['openid'],
        CallbackURLs: redirect_uris,
        GenerateSecret: false,
        ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH'],
        SupportedIdentityProviders: ['COGNITO']
      });
      
      const result = await cognito.send(createCmd);
      userPoolClient = result.UserPoolClient;
      
      // Store minimal info in DynamoDB for future lookups
      await storePublicClient(client_name, redirect_uris, userPoolClient.ClientId);
      
      console.log('Created and stored new client:', userPoolClient.ClientId);

      // Create managed login branding for the new client - This is currently limited to 10 app clients
      try {
        const brandingCmd = new CreateManagedLoginBrandingCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          ClientId: userPoolClient.ClientId,
          UseCognitoProvidedValues: true
        });
        
        await cognito.send(brandingCmd);
        console.log('Created branding for client:', userPoolClient.ClientId);
      } catch (brandingError) {
        console.log('Warning: Could not create branding for client:', brandingError.message);
        // Continue without branding - client still works
      }
    }

    // Build RFC 7591 response (public client only)
    const now = Math.floor(Date.now() / 1000);
    const response = {
      client_id: userPoolClient.ClientId,
      client_id_issued_at: now,
      redirect_uris,
      grant_types,
      response_types,
      token_endpoint_auth_method: 'none'
    };

    // Include optional metadata that was provided
    if (client_name) response.client_name = client_name;
    if (scope) response.scope = scope;
    if (contacts) response.contacts = contacts;
    if (logo_uri) response.logo_uri = logo_uri;
    if (client_uri) response.client_uri = client_uri;
    if (policy_uri) response.policy_uri = policy_uri;
    if (tos_uri) response.tos_uri = tos_uri;
    if (jwks_uri) response.jwks_uri = jwks_uri;
    if (jwks) response.jwks = jwks;
    if (software_id) response.software_id = software_id;
    if (software_version) response.software_version = software_version;

    // Include internationalized client names and extension parameters safely
    return jsonResponse(201, { ...response, ...i18nNames, ...extensionParams });
  } catch (err) {
    console.log(err);
    if (err instanceof SyntaxError) {
      return jsonResponse(400, {
        error: 'invalid_request',
        error_description: 'Invalid JSON in request body'
      });
    }
    
    return jsonResponse(500, {
      error: 'server_error',
      error_description: 'Internal server error'
    });
  }
};

// Helper for RFC 7591 JSON responses
function jsonResponse(statusCode, bodyObj) {
  console.log("Returning response", + statusCode, bodyObj);
  return {
    statusCode,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Pragma': 'no-cache'
    },
    body: JSON.stringify(bodyObj)
  };
}


