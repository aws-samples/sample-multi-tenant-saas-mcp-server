#!/usr/bin/env node

import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminUpdateUserAttributesCommand, ListUsersCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function promptPassword(prompt = 'Password: ') {
  if (!process.stdin.isTTY) {
    // Non-interactive: read line from piped stdin
    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) { rl.close(); return line; }
    return '';
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let pw = '';
    const onData = (ch) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(pw);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007F' || ch === '\b') {
        pw = pw.slice(0, -1);
      } else {
        pw += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';
const credentials = fromNodeProviderChain();

async function getStackOutput(stackName, outputKey) {
  const cfn = new CloudFormationClient({ region: REGION, credentials });
  const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  return res.Stacks?.[0]?.Outputs?.find(o => o.OutputKey === outputKey)?.OutputValue;
}

// Resolve config from env vars or CloudFormation stack outputs
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || await getStackOutput('MCPServerInfrastructureStack', 'MCPServerUserPoolId');
const POLICY_BUCKET = process.env.POLICY_BUCKET_NAME || await getStackOutput('MCPServerInfrastructureStack', 'MCPServerPolicyBucketName');

if (!USER_POOL_ID) {
  console.error('Error: Could not resolve User Pool ID from env or MCPServerInfrastructureStack outputs');
  process.exit(1);
}
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION, credentials });
const s3Client = new S3Client({ region: REGION, credentials });

// Derive tenantId from email alias (same logic as post-confirmation Lambda)
function deriveTenant(email) {
  let tenantId = null;
  let tenantTier = 'basic';

  if (email && email.includes('+')) {
    const alias = email.split('@')[0].split('+')[1]?.trim();
    if (alias) {
      tenantId = alias;
      tenantTier = 'standard';
    }
  }

  if (!tenantId) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    tenantId = `TENANT_${ts}_${rand}`.toUpperCase();
  }

  return { tenantId, tenantTier };
}

// Upload S3 template files for tenant (same as post-confirmation Lambda)
async function uploadTenantFiles(tenantId) {
  if (!POLICY_BUCKET) {
    console.log('   ⚠ POLICY_BUCKET_NAME not set, skipping S3 upload');
    return;
  }

  const templatesDir = join(__dirname, 'templates');
  let files;
  try { files = readdirSync(templatesDir); } catch { console.log('   ⚠ Templates dir not found, skipping S3 upload'); return; }

  for (const filename of files) {
    if (filename.startsWith('.')) continue;
    const filepath = join(templatesDir, filename);
    if (!statSync(filepath).isFile()) continue;

    let content = readFileSync(filepath, 'utf8').replace(/{{TENANT}}/g, tenantId);
    const contentType = filename.endsWith('.json') ? 'application/json' : filename.endsWith('.md') ? 'text/markdown' : 'text/plain';

    await s3Client.send(new PutObjectCommand({
      Bucket: POLICY_BUCKET,
      Key: `${tenantId}/${filename}`,
      Body: content,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }));
    console.log(`   ✓ Uploaded ${filename} → s3://${POLICY_BUCKET}/${tenantId}/${filename}`);
  }
}

async function createUser(username, email, password) {
  try {
    console.log(`Creating user: ${username} (${email})`);

    await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    }));

    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      Password: password,
      Permanent: true,
    }));
    console.log(`   ✓ User created with permanent password`);

    // Assign tenant (replicates post-confirmation Lambda)
    const { tenantId, tenantTier } = deriveTenant(email);
    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        { Name: 'custom:tenantId', Value: tenantId },
        { Name: 'custom:tenantTier', Value: tenantTier },
      ],
    }));
    console.log(`   ✓ Tenant assigned: ${tenantId} (${tenantTier})`);

    // Upload S3 template files
    await uploadTenantFiles(tenantId);

    console.log(`   ✅ Done\n`);
    return true;
  } catch (error) {
    if (error.name === 'UsernameExistsException') {
      console.error(`   ✗ User '${username}' already exists\n`);
    } else {
      console.error(`   ✗ Failed: ${error.message}\n`);
    }
    return false;
  }
}

async function listUsers() {
  const response = await cognitoClient.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID }));
  if (!response.Users?.length) { console.log('No users found.'); return; }

  for (const user of response.Users) {
    const attr = (name) => user.Attributes?.find(a => a.Name === name)?.Value || '-';
    console.log(`${user.Username}`);
    console.log(`   Email: ${attr('email')}  Status: ${user.UserStatus}  Tenant: ${attr('custom:tenantId')} (${attr('custom:tenantTier')})\n`);
  }
}

async function deleteUser(username) {
  try {
    await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    console.log(`✓ Deleted ${username}`);
  } catch (error) {
    console.error(`✗ Failed to delete ${username}: ${error.message}`);
  }
}

// CLI
const [command, ...rest] = process.argv.slice(2);
console.log(`User Pool: ${USER_POOL_ID} | Region: ${REGION}\n`);

switch (command) {
  case 'create': {
    const [username, email] = rest;
    if (!username || !email) {
      console.log('Usage: manage-users.js create <username> <email>');
      console.log('  Email alias sets tenant: user+tenant1@example.com → tenantId=tenant1');
      process.exit(1);
    }
    const password = await promptPassword('Password: ');
    if (!password) { console.error('Password is required'); process.exit(1); }
    await createUser(username, email, password);
    break;
  }
  case 'list':
    await listUsers();
    break;
  case 'delete':
    if (!rest[0]) { console.log('Usage: manage-users.js delete <username>'); process.exit(1); }
    await deleteUser(rest[0]);
    break;
  default:
    console.log('Commands:');
    console.log('  create <username> <email>              - Create user with tenant assignment + S3 files');
    console.log('  list                                  - List all users with tenant info');
    console.log('  delete <username>                     - Delete a user');
    console.log('\nEmail alias sets tenant: user+mytenant@example.com → tenantId=mytenant');
}
