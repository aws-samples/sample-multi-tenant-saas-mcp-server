#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { McpPlaygroundStack } from './lib/mcp-playground-stack';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { addCommonSuppressions } from './lib/nag-suppressions';

const app = new cdk.App();

// Get environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Get deployment configuration from context or environment
const domainName = app.node.tryGetContext('domainName') || process.env.DOMAIN_NAME;
const certificateArn = app.node.tryGetContext('certificateArn') || process.env.CERTIFICATE_ARN;
const hostedZoneId = app.node.tryGetContext('hostedZoneId') || process.env.HOSTED_ZONE_ID;
const zoneName = app.node.tryGetContext('zoneName') || process.env.ZONE_NAME;

const stack = new McpPlaygroundStack(app, 'McpPlaygroundStack', {
  env,
  description: 'MCP Playground - Amazon Bedrock Edition with S3/CloudFront + API Gateway/Lambda',
  domainName,
  certificateArn,
  hostedZoneId,
  zoneName,
});

// Add CDK Nag security checks
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Apply common suppressions for acceptable patterns
addCommonSuppressions(stack);

app.synth();
