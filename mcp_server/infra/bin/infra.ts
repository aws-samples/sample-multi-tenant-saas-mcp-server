#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { ApplicationStack } from '../lib/application-stack';

const app = new cdk.App();

// Add CDK Nag with AWS Solutions pack
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Define the environment for all stacks
const env = { 
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID, 
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1'
};

// Create the infrastructure stack first
const mcpServerInfrastructureStack = new InfrastructureStack(app, 'MCPServerInfrastructureStack', {
  /* Use the same environment for all stacks */
  env: env
});

// Create the application stack, passing in the resources from the infrastructure stack
const mcpServerApplicationStack = new ApplicationStack(app, 'MCPServerApplicationStack', {
  mcpServerTravelBookingsTable: mcpServerInfrastructureStack.mcpServerTravelBookingsTable,
  mcpServerPolicyBucket: mcpServerInfrastructureStack.mcpServerPolicyBucket,
  mcpServerTaskRole: mcpServerInfrastructureStack.mcpServerTaskRole,
  mcpServerDataAccessRole: mcpServerInfrastructureStack.mcpServerDataAccessRole,
  mcpServerUserPool: mcpServerInfrastructureStack.mcpServerUserPool,
  mcpServerUserPoolDomain: mcpServerInfrastructureStack.mcpServerUserPoolDomain,
  // Pass DCR API URL if DCR is enabled
  dcrApiUrl: mcpServerInfrastructureStack.dcrApiUrl,
  
  /* Use the same environment as the infrastructure stack */
  env: env
});

// Add dependencies to ensure proper deployment order
mcpServerApplicationStack.addDependency(mcpServerInfrastructureStack);

// Add CDK Nag suppressions for demo purposes
NagSuppressions.addStackSuppressions(mcpServerInfrastructureStack, [
  {
    id: 'AwsSolutions-IAM4',
    reason: 'Demo repository - AWS managed policies acceptable for Lambda execution roles'
  },
  {
    id: 'AwsSolutions-S1',
    reason: 'Demo repository - S3 access logs not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-COG2',
    reason: 'Demo repository - MFA not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-DDB3',
    reason: 'Demo repository - DynamoDB point-in-time recovery not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-COG3',
    reason: 'Demo repository - Cognito Advanced Security Mode not required for demonstration purposes due to additional costs'
  },
  {
    id: 'AwsSolutions-APIG4',
    reason: 'DCR and OpenID Configuration endpoints are public OAuth/OIDC standard endpoints that must not require authorization per RFC specifications'
  },
  {
    id: 'AwsSolutions-COG4',
    reason: 'DCR and OpenID Configuration endpoints are public OAuth/OIDC standard endpoints that must not use Cognito authorization per RFC specifications'
  },
    {
    id: 'AwsSolutions-IAM5',
    reason: 'S3 bucket policy needs access to multiple prefixes but is restricted by tenant condition'
  },
  {
    id: 'AwsSolutions-APIG1',
    reason: 'Demo repository - API Gateway access logging not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-APIG2',
    reason: 'Demo repository - API Gateway request validation not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-APIG3',
    reason: 'Demo repository - API Gateway WAF integration not required for demonstration purposes due to additional costs'
  },
  {
    id: 'AwsSolutions-CFR1',
    reason: 'Demo repository - CloudFront geo restrictions not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-CFR2',
    reason: 'Demo repository - CloudFront WAF integration not required for demonstration purposes due to additional costs'
  },
  {
    id: 'AwsSolutions-CFR3',
    reason: 'Demo repository - CloudFront access logging not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-CFR4',
    reason: 'Demo repository - CloudFront uses default viewer certificate which enforces TLSv1 minimum. Production deployments should use custom certificates with TLSv1.2+ minimum'
  },
  {
    id: 'AwsSolutions-IAM5',
    reason: 'AWS CDK LogRetention construct requires wildcard permissions for CloudWatch log group creation and management operations',
    appliesTo: ['Resource::*']
  }
]);

NagSuppressions.addStackSuppressions(mcpServerApplicationStack, [
  {
    id: 'AwsSolutions-ELB2',
    reason: 'Demo repository - Load balancer access logs not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-VPC7',
    reason: 'Demo repository - VPC Flow Logs not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-ECS4',
    reason: 'Demo repository - CloudWatch Container Insights not required for demonstration purposes'
  },
  {
    id: 'AwsSolutions-IAM5',
    reason: 'ECS Task Execution Role requires wildcard permissions for AWS service operations: ECR authorization tokens and CloudWatch log group creation',
    appliesTo: ['Resource::*']
  },
  {
    id: 'AwsSolutions-EC23',
    reason: 'Public MCP server API requires internet access - ALB security group must allow 0.0.0.0/0 inbound traffic for public accessibility'
  },
  {
    id: 'AwsSolutions-ECS2',
    reason: 'Environment variables contain only non-confidential configuration data (resource names, public identifiers, URLs) - no secrets requiring AWS Secrets Manager'
  }
]);

// Export stack references for cross-stack integration
export { mcpServerInfrastructureStack, mcpServerApplicationStack };
