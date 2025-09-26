#!/usr/bin/env node

import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, ListUsersCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

// Configuration
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';

if (!USER_POOL_ID) {
  console.error('Error: COGNITO_USER_POOL_ID environment variable is required');
  process.exit(1);
}

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: REGION,
  credentials: fromNodeProviderChain(),
});

async function createUser(username, email, password, temporary = false) {
  try {
    console.log(`Creating user: ${username} (${email})`);
    
    // Create the user
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        {
          Name: 'email',
          Value: email,
        },
        {
          Name: 'email_verified',
          Value: 'true',
        },
      ],
      TemporaryPassword: temporary ? password : undefined,
      MessageAction: 'SUPPRESS', // Don't send welcome email
    });

    await cognitoClient.send(createCommand);
    console.log(`✓ User ${username} created successfully`);

    // Set permanent password if not temporary
    if (!temporary) {
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        Password: password,
        Permanent: true,
      });

      await cognitoClient.send(setPasswordCommand);
      console.log(`✓ Password set for user ${username}`);
    }

    return true;
  } catch (error) {
    console.error(`✗ Failed to create user ${username}:`, error.message);
    return false;
  }
}

async function listUsers() {
  try {
    console.log('Listing users in User Pool...');
    
    const command = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
    });

    const response = await cognitoClient.send(command);
    
    if (response.Users && response.Users.length > 0) {
      console.log('\nUsers:');
      response.Users.forEach((user, index) => {
        const username = user.Username;
        const email = user.Attributes?.find(attr => attr.Name === 'email')?.Value || 'No email';
        const status = user.UserStatus;
        const enabled = user.Enabled ? 'Enabled' : 'Disabled';
        
        console.log(`${index + 1}. ${username}`);
        console.log(`   Email: ${email}`);
        console.log(`   Status: ${status}`);
        console.log(`   Enabled: ${enabled}`);
        console.log('');
      });
    } else {
      console.log('No users found in the User Pool.');
    }

    return true;
  } catch (error) {
    console.error('✗ Failed to list users:', error.message);
    return false;
  }
}

async function deleteUser(username) {
  try {
    console.log(`Deleting user: ${username}`);
    
    const command = new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });

    await cognitoClient.send(command);
    console.log(`✓ User ${username} deleted successfully`);

    return true;
  } catch (error) {
    console.error(`✗ Failed to delete user ${username}:`, error.message);
    return false;
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log(`Using User Pool: ${USER_POOL_ID}`);
  console.log(`Region: ${REGION}\n`);

  switch (command) {
    case 'create':
      if (args.length < 4) {
        console.log('Usage: node manage-users.js create <username> <email> <password> [temporary]');
        console.log('Example: node manage-users.js create testuser test@example.com MyPassword123!');
        process.exit(1);
      }
      const [, username, email, password] = args;
      const temporary = args[5] === 'true';
      await createUser(username, email, password, temporary);
      break;

    case 'list':
      await listUsers();
      break;

    case 'delete':
      if (args.length < 2) {
        console.log('Usage: node manage-users.js delete <username>');
        console.log('Example: node manage-users.js delete testuser');
        process.exit(1);
      }
      await deleteUser(args[1]);
      break;

    case 'demo':
      console.log('Creating demo users...\n');
      await createUser('demo', 'demo@example.com', 'DemoPassword123!');
      await createUser('testuser', 'test@example.com', 'TestPassword123!');
      console.log('\nDemo users created! You can now sign in with:');
      console.log('Username: demo, Password: DemoPassword123!');
      console.log('Username: testuser, Password: TestPassword123!');
      break;

    default:
      console.log('Available commands:');
      console.log('  create <username> <email> <password> [temporary] - Create a new user');
      console.log('  list                                            - List all users');
      console.log('  delete <username>                               - Delete a user');
      console.log('  demo                                            - Create demo users');
      console.log('');
      console.log('Examples:');
      console.log('  node manage-users.js create john john@example.com MyPassword123!');
      console.log('  node manage-users.js list');
      console.log('  node manage-users.js delete john');
      console.log('  node manage-users.js demo');
      break;
  }
}

main().catch(console.error);
