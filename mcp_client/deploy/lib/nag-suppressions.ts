import { NagSuppressions, RegexAppliesTo } from 'cdk-nag';
import { Stack } from 'aws-cdk-lib';

export function addCommonSuppressions(stack: Stack) {
  // Add common suppressions for known acceptable patterns
  NagSuppressions.addStackSuppressions(stack, [
    // IAM suppressions
    {
      id: 'AwsSolutions-IAM4',
      reason: 'AWS managed policies are acceptable for Lambda execution roles and standard services',
      appliesTo: [
        'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'
      ]
    },
    {
      id: 'AwsSolutions-IAM5',
      reason: 'Wildcard permissions are needed for Bedrock model access, CloudWatch logs, and CDK deployment operations',
      appliesTo: [
        'Resource::*',
        'Action::bedrock:*',
        'Action::logs:*',
        // CDK BucketDeployment permissions (necessary for deploying website files)
        'Action::s3:GetBucket*',
        'Action::s3:GetObject*',
        'Action::s3:List*',
        'Action::s3:Abort*',
        'Action::s3:DeleteObject*',
        'Resource::<WebsiteBucket75C24D94.Arn>/*'
      ]
    },
    
    // API Gateway suppressions
    {
      id: 'AwsSolutions-APIG1',
      reason: 'Access logging not required for demo application'
    },
    {
      id: 'AwsSolutions-APIG2',
      reason: 'Request validation handled at application level'
    },
    {
      id: 'AwsSolutions-APIG3',
      reason: 'WAF not required for demo application'
    },
    {
      id: 'AwsSolutions-APIG4',
      reason: 'API Gateway authorization is handled at the application level with Cognito JWT validation'
    },
    {
      id: 'AwsSolutions-APIG6',
      reason: 'CloudWatch logging not required for demo application'
    },
    
    // Cognito suppressions
    {
      id: 'AwsSolutions-COG1',
      reason: 'Password policy is configured with appropriate complexity requirements'
    },
    {
      id: 'AwsSolutions-COG2',
      reason: 'MFA not required for demo application - can be enabled in production'
    },
    {
      id: 'AwsSolutions-COG3',
      reason: 'Advanced security mode not required for demo application'
    },
    {
      id: 'AwsSolutions-COG4',
      reason: 'Cognito User Pool authorization handled at application level with JWT validation'
    },
    
    // CloudFront suppressions
    {
      id: 'AwsSolutions-CFR1',
      reason: 'CloudFront geo restriction not required for global demo application'
    },
    {
      id: 'AwsSolutions-CFR2',
      reason: 'WAF not required for demo application'
    },
    {
      id: 'AwsSolutions-CFR3',
      reason: 'CloudFront access logging not required for demo application'
    },
    {
      id: 'AwsSolutions-CFR4',
      reason: 'Using ACM certificate with modern TLS configuration'
    },
    {
      id: 'AwsSolutions-CFR7',
      reason: 'Using Origin Access Identity (OAI) which is acceptable for this use case'
    },
    
    // S3 suppressions
    {
      id: 'AwsSolutions-S1',
      reason: 'S3 access logging not required for demo application'
    },
    {
      id: 'AwsSolutions-S10',
      reason: 'SSL enforcement handled by CloudFront and application-level security'
    },
    
    // Lambda suppressions
    {
      id: 'AwsSolutions-L1',
      reason: 'Using Node.js 18.x which is a supported runtime version'
    },
    
    // CDK BucketDeployment specific suppressions (for any CDK assets bucket)
    {
      id: 'AwsSolutions-IAM5',
      reason: 'CDK BucketDeployment requires access to CDK assets bucket for deployment operations',
      appliesTo: [
        { regex: '/^Resource::arn:aws:s3:::cdk-.*-assets-.*-.*\\/\\*$/g' }
      ]
    }
  ]);
}
