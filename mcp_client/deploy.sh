#!/bin/bash

set -e

echo "🚀 MCP Playground Unified Deployment Script"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the typescript-client directory."
    exit 1
fi

# Parse command line arguments
DEPLOYMENT_TYPE=""
DOMAIN_NAME=""
HOSTED_ZONE_ID=""
ZONE_NAME=""
CERT_ARN=""

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --simple                    Simple deployment (CloudFront domain only)"
    echo "  --custom-domain DOMAIN      Custom domain deployment (Route53 + CloudFront)"
    echo "  --external-dns DOMAIN       Custom domain with external DNS (CloudFront only)"
    echo "  --hosted-zone-id ID         Route53 hosted zone ID (for --custom-domain)"
    echo "  --zone-name NAME            Route53 zone name (for --custom-domain)"
    echo "  --cert-arn ARN              ACM certificate ARN"
    echo "  --help                      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --simple"
    echo "  $0 --custom-domain mcp-playground.example.com --hosted-zone-id Z123456789 --zone-name example.com --cert-arn arn:aws:acm:us-east-1:123456789:certificate/abc123"
    echo "  $0 --external-dns mcp-playground.example.com --cert-arn arn:aws:acm:us-east-1:123456789:certificate/abc123"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --simple)
            DEPLOYMENT_TYPE="1"
            shift
            ;;
        --custom-domain)
            DEPLOYMENT_TYPE="2"
            DOMAIN_NAME="$2"
            shift 2
            ;;
        --external-dns)
            DEPLOYMENT_TYPE="3"
            DOMAIN_NAME="$2"
            shift 2
            ;;
        --hosted-zone-id)
            HOSTED_ZONE_ID="$2"
            shift 2
            ;;
        --zone-name)
            ZONE_NAME="$2"
            shift 2
            ;;
        --cert-arn)
            CERT_ARN="$2"
            shift 2
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the React application
echo "📦 Building React application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Error: Build failed. dist directory not found."
    exit 1
fi

echo "✅ Build completed successfully!"
echo ""

# If no deployment type specified, ask interactively
if [ -z "$DEPLOYMENT_TYPE" ]; then
    echo "🌐 Deployment Options:"
    echo "1. Simple deployment (CloudFront domain only)"
    echo "2. Custom domain deployment (Route53 + CloudFront in same account)"
    echo "3. Custom domain with external DNS (CloudFront + manual DNS configuration)"
    echo ""
    echo "Choose deployment type (1, 2, or 3):"
    read -r DEPLOYMENT_TYPE
fi

if [ "$DEPLOYMENT_TYPE" = "2" ]; then
    # Custom domain deployment
    if [ -z "$DOMAIN_NAME" ]; then
        echo ""
        echo "📝 Custom Domain Setup"
        echo "Enter your domain name (e.g., mcp-playground.example.com):"
        read -r DOMAIN_NAME
    fi
    
    if [ -z "$DOMAIN_NAME" ]; then
        echo "❌ Error: Domain name cannot be empty."
        exit 1
    fi
    
    echo ""
    echo "📋 Setting up deployment for domain: $DOMAIN_NAME"
    echo ""
    
    # Check hosted zone
    if [ -z "$HOSTED_ZONE_ID" ]; then
        echo "🔍 Checking for Route53 hosted zones..."
        echo ""
        echo "Do you have a Route53 hosted zone for this domain? (y/n)"
        read -r HAS_HOSTED_ZONE
        
        if [ "$HAS_HOSTED_ZONE" = "y" ] || [ "$HAS_HOSTED_ZONE" = "Y" ]; then
            echo ""
            echo "📝 Please provide your Route53 hosted zone details:"
            echo "Enter your hosted zone ID (e.g., Z1D633PJN98FT9):"
            read -r HOSTED_ZONE_ID
            echo "Enter your zone name (usually same as domain, e.g., example.com):"
            read -r ZONE_NAME
        else
            echo "❌ Error: Route53 hosted zone is required for custom domain deployment."
            echo "Please create a hosted zone first or use simple deployment."
            exit 1
        fi
    fi
    
    # Check certificate
    if [ -z "$CERT_ARN" ]; then
        echo ""
        echo "🔍 Checking for existing ACM certificates..."
        echo ""
        echo "Do you have an existing ACM certificate for this domain? (y/n)"
        read -r HAS_CERT
        
        if [ "$HAS_CERT" = "y" ] || [ "$HAS_CERT" = "Y" ]; then
            echo "Enter your ACM certificate ARN:"
            read -r CERT_ARN
        else
            echo "❌ Error: ACM certificate is required for custom domain deployment."
            echo "Please create a certificate first or use simple deployment."
            exit 1
        fi
    fi
    
    # Validate required parameters for custom domain
    if [ -z "$HOSTED_ZONE_ID" ] || [ -z "$ZONE_NAME" ] || [ -z "$CERT_ARN" ]; then
        echo "❌ Error: Missing required parameters for custom domain deployment."
        echo "Required: --hosted-zone-id, --zone-name, --cert-arn"
        exit 1
    fi
elif [ "$DEPLOYMENT_TYPE" = "3" ]; then
    # External DNS deployment
    if [ -z "$DOMAIN_NAME" ]; then
        echo ""
        echo "📝 External DNS Custom Domain Setup"
        echo "Enter your domain name (e.g., mcp-playground.example.com):"
        read -r DOMAIN_NAME
    fi
    
    if [ -z "$DOMAIN_NAME" ]; then
        echo "❌ Error: Domain name cannot be empty."
        exit 1
    fi
    
    echo ""
    echo "📋 Setting up deployment for domain: $DOMAIN_NAME (external DNS)"
    echo ""
    
    # Check certificate
    if [ -z "$CERT_ARN" ]; then
        echo "🔍 Checking for existing ACM certificates..."
        echo ""
        echo "Do you have an existing ACM certificate for this domain? (y/n)"
        read -r HAS_CERT
        
        if [ "$HAS_CERT" = "y" ] || [ "$HAS_CERT" = "Y" ]; then
            echo "Enter your ACM certificate ARN:"
            read -r CERT_ARN
        else
            echo "❌ Error: ACM certificate is required for custom domain deployment."
            echo "Please create a certificate first using DNS validation."
            echo "You can create one in AWS Certificate Manager and validate it with your DNS provider."
            exit 1
        fi
    fi
    
    # Validate required parameters for external DNS
    if [ -z "$CERT_ARN" ]; then
        echo "❌ Error: Missing required parameter for external DNS deployment."
        echo "Required: --cert-arn"
        exit 1
    fi
fi

# Navigate to deploy directory and install dependencies
cd deploy
echo "📦 Installing CDK dependencies..."
npm install

# Copy the main project's package-lock.json to deploy directory for Lambda bundling
echo "🔄 Syncing package-lock.json for Lambda bundling..."
cp ../package-lock.json ./package-lock.json

# Bootstrap CDK (if not already done)
echo "🔧 Bootstrapping CDK..."
npx cdk bootstrap

# Deploy based on type
if [ "$DEPLOYMENT_TYPE" = "2" ]; then
    # Custom domain deployment with Route53
    echo ""
    echo "🚀 Deploying with custom domain: $DOMAIN_NAME"
    JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1 npx cdk deploy \
        --context domainName="$DOMAIN_NAME" \
        --context certificateArn="$CERT_ARN" \
        --context hostedZoneId="$HOSTED_ZONE_ID" \
        --context zoneName="$ZONE_NAME" \
        --require-approval never
elif [ "$DEPLOYMENT_TYPE" = "3" ]; then
    # External DNS deployment
    echo ""
    echo "🚀 Deploying with custom domain (external DNS): $DOMAIN_NAME"
    JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1 npx cdk deploy \
        --context domainName="$DOMAIN_NAME" \
        --context certificateArn="$CERT_ARN" \
        --context externalDns="true" \
        --require-approval never
else
    # Simple deployment
    echo ""
    echo "🚀 Starting simple deployment (CloudFront domain)..."
    JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1 npx cdk deploy --require-approval never
fi

echo ""
echo "✅ Deployment completed successfully!"
echo ""

# Generate environment setup commands for copy-paste
generate_env_commands() {
    echo "📝 Environment setup for local development and demo users..."
    
    # Get the actual stack name from CDK context or default
    local STACK_NAME="McpPlaygroundStack"
    
    # Get CloudFormation outputs with error handling
    echo "🔍 Fetching CloudFormation outputs from stack: $STACK_NAME"
    
    local USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text 2>/dev/null)
    local CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text 2>/dev/null)
    local AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
    
    # Check if we got the required values
    if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ]; then
        echo "❌ Could not retrieve Cognito User Pool ID from CloudFormation stack '$STACK_NAME'"
        echo "   Available outputs:"
        aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}" --output table 2>/dev/null || echo "   Stack not found or no outputs available"
        return 1
    fi
    
    echo ""
    echo "✅ Environment variables ready!"
    echo ""
    echo "📋 Copy and paste these commands to set up your environment:"
    echo ""
    echo "export COGNITO_USER_POOL_ID=$USER_POOL_ID"
    echo "export COGNITO_CLIENT_ID=$CLIENT_ID"
    echo "export COGNITO_REGION=$AWS_REGION"
    echo ""
    echo "# Then run:"
    echo "npm run users:demo"
}

# Generate environment setup commands
generate_env_commands

echo ""
echo "📋 Next steps:"
echo "1. Create demo users: npm run users:demo"
echo "2. Check the CloudFormation outputs for your website URL"
if [ "$DEPLOYMENT_TYPE" = "2" ]; then
    echo "3. Test the application by visiting: https://$DOMAIN_NAME"
elif [ "$DEPLOYMENT_TYPE" = "3" ]; then
    echo "3. Configure DNS: Create a CNAME record pointing $DOMAIN_NAME to the CloudFront domain"
    echo "4. Test the application by visiting: https://$DOMAIN_NAME (after DNS propagation)"
else
    echo "3. Test the application by visiting the CloudFront URL"
fi
echo ""
echo "🔧 To update the application:"
echo "1. Make your changes to the React app"
echo "2. Run './deploy.sh' from the root directory"
echo ""
echo "🗑️  To clean up resources:"
echo "Run 'npx cdk destroy' in the deploy directory"
