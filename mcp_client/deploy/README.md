# MCP Playground - AWS Deployment

This directory contains the AWS CDK infrastructure code for deploying the MCP Playground TypeScript client to AWS using a serverless architecture.

## Architecture

The deployment creates the following AWS resources:

### Frontend (S3 + CloudFront)
- **S3 Bucket**: Hosts the built React application
- **CloudFront Distribution**: CDN for global content delivery with custom domain support
- **Origin Access Control**: Secure access from CloudFront to S3

### Backend (API Gateway + Lambda)
- **Lambda Function**: Handles API requests for Bedrock inference and MCP proxy
- **API Gateway**: REST API with CORS support
- **IAM Roles**: Proper permissions for Bedrock access

### Optional (Custom Domain)
- **ACM Certificate**: SSL/TLS certificate for HTTPS
- **Route53 Records**: DNS configuration for custom domain

## Prerequisites

1. **AWS CLI configured** with appropriate permissions
2. **Node.js 18+** installed
3. **AWS CDK v2** installed globally: `npm install -g aws-cdk`
4. **Bedrock model access** enabled in your AWS account

### Required AWS Permissions

Your AWS credentials need the following permissions:
- CloudFormation (full access)
- S3 (full access)
- CloudFront (full access)
- API Gateway (full access)
- Lambda (full access)
- IAM (create/manage roles and policies)
- Bedrock (InvokeModel permissions)
- ACM (if using custom domain)
- Route53 (if using custom domain)

## 🚀 Quick Deployment

### Interactive Deployment (Recommended)

From the mcp_client root directory:

```bash
./deploy.sh
```

The script will prompt you to choose:
1. **Simple Deployment**: CloudFront domain only
2. **Custom Domain**: Route53 + CloudFront with SSL

This unified script handles:
- Building the React application
- Installing CDK dependencies
- Bootstrapping CDK (if needed)
- Interactive domain setup
- Certificate management
- DNS configuration

### Manual Deployment Options

#### Option 1: Simple Deployment (CloudFront domain)

```bash
# From the deploy directory
npm install
npx cdk bootstrap
npx cdk deploy --require-approval never
```

#### Option 2: Custom Domain Deployment

```bash
# From the deploy directory
npm install
npx cdk bootstrap
npx cdk deploy \
  --context domainName=your-domain.com \
  --context certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/... \
  --context hostedZoneId=Z1D633PJN98FT9 \
  --context zoneName=your-domain.com \
  --require-approval never
```

## Configuration Options

### CDK Context Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| `domainName` | Custom domain name (e.g., mcp-playground.example.com) | No |
| `certificateArn` | ACM certificate ARN (must be in us-east-1) | No* |
| `hostedZoneId` | Route53 hosted zone ID | No* |
| `zoneName` | Route53 zone name (e.g., example.com) | No* |

*Required if using custom domain

## Custom Domain Setup

### Prerequisites for Custom Domain

1. **Route53 Hosted Zone**: You must have a hosted zone for your domain
2. **Domain Control**: Ability to update nameservers or DNS records
3. **ACM Certificate**: SSL certificate in us-east-1 region (for CloudFront)

### Step-by-Step Domain Setup

#### 1. Check Existing Resources

```bash
# Check for hosted zones
aws route53 list-hosted-zones --query "HostedZones[?Name=='example.com.'].[Id,Name]" --output table

# Check for certificates
aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='mcp-playground.example.com'].[CertificateArn,DomainName]" --output table
```

#### 2. Create ACM Certificate (if needed)

```bash
# Request certificate (must be in us-east-1 for CloudFront)
aws acm request-certificate \
  --domain-name mcp-playground.example.com \
  --validation-method DNS \
  --region us-east-1
```

#### 3. Validate Certificate

Follow DNS validation in AWS Console or use CLI:

```bash
# Get validation records
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/... \
  --region us-east-1
```

#### 4. Deploy with Interactive Script

```bash
# Use the interactive deployment script
./deploy.sh
# Choose option 2 for custom domain
# Follow the prompts for domain configuration
```

## Development Workflow

### Local Development

```bash
# From mcp_client root directory
npm start
```

This runs both the React dev server (port 5173) and Express API server (port 3001).

### Deploy Updates

```bash
# Build and deploy changes
npm run build
cd deploy
npx cdk deploy
```

### View Deployment Status

```bash
# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name McpPlaygroundStack

# Get stack outputs (including URLs)
aws cloudformation describe-stacks \
  --stack-name McpPlaygroundStack \
  --query "Stacks[0].Outputs"
```

## Monitoring and Troubleshooting

### CloudFormation Stack

Monitor deployment in AWS Console:
1. Go to CloudFormation
2. Find the `McpPlaygroundStack` stack
3. Check Events and Resources tabs

### Lambda Function Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/McpPlaygroundStack-ApiHandler* --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/McpPlaygroundStack-ApiHandler* \
  --filter-pattern "ERROR"
```

### CloudFront Distribution

Monitor CloudFront performance:
1. Go to CloudFront in AWS Console
2. Find your distribution
3. Check Monitoring and Invalidations tabs

### Common Issues

#### Build Failures
```bash
# Ensure build completes successfully
npm run build
ls -la dist/  # Should contain index.html and assets
```

#### Lambda Cold Starts
- Monitor Lambda duration metrics
- Consider provisioned concurrency for production

#### CORS Issues
- Verify API Gateway CORS configuration
- Check browser developer tools for CORS errors

#### Domain Issues
```bash
# Check certificate status
aws acm describe-certificate --certificate-arn arn:aws:acm:... --region us-east-1

# Check DNS resolution
nslookup your-domain.com
dig your-domain.com
```

#### MCP Connection Issues
- Verify Lambda has internet access
- Check security group and VPC configuration (if applicable)
- Monitor Lambda logs for connection errors

## Performance Optimization

### CloudFront
- Enable compression for better performance
- Configure appropriate caching behaviors
- Use appropriate price class for your audience

### Lambda
- Monitor memory usage and adjust accordingly
- Optimize cold start performance
- Consider provisioned concurrency for consistent performance

### S3
- Enable transfer acceleration if needed
- Use appropriate storage class for your use case

## Security Best Practices

### S3 Bucket Security
- Public access blocked by default
- Access only through CloudFront OAC
- Versioning enabled for rollback capability

### Lambda Security
- Follows least privilege principle
- Only necessary Bedrock permissions
- No hardcoded credentials

### API Gateway Security
- CORS properly configured
- Rate limiting can be added
- API keys or authentication can be implemented

### CloudFront Security
- HTTPS redirect enabled
- Security headers via response headers policy
- Origin access restricted to CloudFront

## Cost Management

### Monitoring Costs
```bash
# Check current month costs for the stack
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

### Cost Optimization Tips
- **S3**: Enable Intelligent Tiering
- **CloudFront**: Choose appropriate price class
- **Lambda**: Right-size memory allocation
- **API Gateway**: Monitor request volume

## Cleanup

### Remove All Resources

```bash
cd deploy
npx cdk destroy
```

**⚠️ Warning**: This will permanently delete:
- S3 bucket and all contents
- CloudFront distribution
- Lambda function and logs
- API Gateway
- Custom domain configuration (if configured)

### Selective Cleanup

```bash
# List all resources in the stack
aws cloudformation list-stack-resources --stack-name McpPlaygroundStack

# Delete specific resources if needed (advanced)
```

## Advanced Configuration

### Environment-Specific Deployments

```bash
# Deploy to different environments
npx cdk deploy --context environment=staging
npx cdk deploy --context environment=production
```

### Custom Lambda Configuration

Edit `lib/mcp-playground-stack.ts` to modify:
- Memory allocation
- Timeout settings
- Environment variables
- VPC configuration

### CloudFront Customization

Modify CloudFront settings in the stack:
- Cache behaviors
- Origin request policies
- Response headers policies
- Geographic restrictions

## Support and Troubleshooting

### Getting Help

1. **Check CloudFormation Events**: Most deployment issues show up here
2. **Review Lambda Logs**: Runtime errors and performance issues
3. **Monitor CloudWatch Metrics**: Performance and usage patterns
4. **Verify Service Limits**: Check AWS service quotas

### Common Commands

```bash
# Check stack status
aws cloudformation describe-stacks --stack-name McpPlaygroundStack

# View recent Lambda logs
aws logs tail /aws/lambda/McpPlaygroundStack-ApiHandler* --since 1h

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890123 \
  --paths "/*"

# Check Bedrock model access
aws bedrock list-foundation-models --region us-east-1
```

For additional support, check the main README.md in the parent directory.
