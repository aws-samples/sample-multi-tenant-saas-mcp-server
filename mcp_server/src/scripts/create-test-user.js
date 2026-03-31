#!/usr/bin/env node

/**
 * Creates a test user for e2e testing.
 * Handles admin user creation + invokes the PostConfirmation Lambda to assign tenantId.
 *
 * Usage: node scripts/create-test-user.js <email> <password>
 * Example: node scripts/create-test-user.js testuser+acme@example.com 'MyPassword1!'
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

const REGION = process.env.AWS_REGION || 'us-east-1';
const STACK_NAME = 'MCPServerInfrastructureStack';

const cfn = new CloudFormationClient({ region: REGION });
const cognito = new CognitoIdentityProviderClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

async function getStackOutput(key) {
  const res = await cfn.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
  return res.Stacks[0].Outputs.find((o) => o.OutputKey === key)?.OutputValue;
}

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node scripts/create-test-user.js <email> <password>');
    console.error('Example: node scripts/create-test-user.js testuser+acme@example.com \'MyPassword1!\'');
    process.exit(1);
  }

  const username = email.split('@')[0];
  const userPoolId = await getStackOutput('MCPServerUserPoolId');
  const lambdaArn = await getStackOutput('MCPServerPostConfirmationLambdaArn');

  if (!userPoolId || !lambdaArn) {
    console.error('Could not find stack outputs. Is MCPServerInfrastructureStack deployed?');
    process.exit(1);
  }

  console.log(`Creating user: ${username} (${email})`);

  // Create user
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: username,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
    MessageAction: 'SUPPRESS',
  }));

  // Set permanent password
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: username,
    Password: password,
    Permanent: true,
  }));

  // Invoke PostConfirmation Lambda to assign tenantId
  await lambda.send(new InvokeCommand({
    FunctionName: lambdaArn,
    Payload: JSON.stringify({
      request: { userAttributes: { email, sub: 'test-sub' } },
      userName: username,
      userPoolId,
      triggerSource: 'PostConfirmation_ConfirmSignUp',
      response: {},
    }),
  }));

  const alias = email.includes('+') ? email.split('+')[1].split('@')[0] : 'DEFAULT';
  console.log(`✅ User created: ${username} (tenantId: ${alias})`);
  console.log(`\nRun e2e tests with:\n   MCP_SERVER_URL=<URL> TEST_USERNAME='${username}' TEST_PASSWORD='<your-password>' npm run test:e2e`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
