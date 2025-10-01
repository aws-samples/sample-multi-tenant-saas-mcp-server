#!/bin/bash

CONFIG_FILE=".deploy-config.json"

# Default values
INFRASTRUCTURE_STACK_NAME="MCPServerInfrastructureStack"
APPLICATION_STACK_NAME="MCPServerApplicationStack"
CERTIFICATE_ARN=""
HOSTED_ZONE_ID=""
ECR_REPOSITORY_NAME="mcp-server-on-ecs"
IMAGE_TAG="latest"
ADMIN_ROLE_NAME=""
AWS_REGION=${AWS_REGION:-us-east-1}
NO_ROLLBACK="true"
DEPLOY_INFRASTRUCTURE="true"
DEPLOY_APPLICATION="true"

# Load previous configuration if it exists
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        echo "Found previous deployment configuration:"
        cat "$CONFIG_FILE" | jq -r 'to_entries[] | "  \(.key): \(.value)"'
        echo ""
        
        # Load values from config
        INFRASTRUCTURE_STACK_NAME=$(jq -r '.infrastructureStackName // "MCPServerInfrastructureStack"' "$CONFIG_FILE")
        APPLICATION_STACK_NAME=$(jq -r '.applicationStackName // "MCPServerApplicationStack"' "$CONFIG_FILE")
        CERTIFICATE_ARN=$(jq -r '.certificateArn // ""' "$CONFIG_FILE")
        HOSTED_ZONE_ID=$(jq -r '.hostedZoneId // ""' "$CONFIG_FILE")
        ECR_REPOSITORY_NAME=$(jq -r '.ecrRepositoryName // "mcp-server-on-ecs"' "$CONFIG_FILE")
        IMAGE_TAG=$(jq -r '.imageTag // "latest"' "$CONFIG_FILE")
        ADMIN_ROLE_NAME=$(jq -r '.adminRoleName // ""' "$CONFIG_FILE")
        AWS_REGION=$(jq -r '.awsRegion // "us-east-1"' "$CONFIG_FILE")
        NO_ROLLBACK=$(jq -r '.noRollback // "true"' "$CONFIG_FILE")
        DEPLOY_INFRASTRUCTURE=$(jq -r '.deployInfrastructure // "true"' "$CONFIG_FILE")
        DEPLOY_APPLICATION=$(jq -r '.deployApplication // "true"' "$CONFIG_FILE")
        
        read -p "Use previous configuration? [Y/n]: " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            return 1
        fi
        return 0
    fi
    return 1
}

# Prompt for configuration values
prompt_config() {
    echo "Configuring deployment settings..."
    echo ""
    
    echo ""
    echo "Note: Some MCP clients require HTTPS connections"
    read -p "Deploy with HTTPS (requires ACM certificate)? [y/N]: " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "ACM certificate ARN: " CERTIFICATE_ARN
        if [ -n "$CERTIFICATE_ARN" ]; then
            read -p "Route 53 hosted zone ID: " HOSTED_ZONE_ID
        fi
    fi
    
    echo ""
    echo "Deployment scope:"
    echo "1) Both infrastructure and application (default)"
    echo "2) Infrastructure only"
    echo "3) Application only"
    read -p "Choose [1-3]: " -n 1 -r
    echo ""
    case $REPLY in
        2)
            DEPLOY_INFRASTRUCTURE="true"
            DEPLOY_APPLICATION="false"
            ;;
        3)
            DEPLOY_INFRASTRUCTURE="false"
            DEPLOY_APPLICATION="true"
            ;;
        *)
            DEPLOY_INFRASTRUCTURE="true"
            DEPLOY_APPLICATION="true"
            ;;
    esac
}

# Save configuration to JSON file
save_config() {
    cat > "$CONFIG_FILE" << EOF
{
  "infrastructureStackName": "$INFRASTRUCTURE_STACK_NAME",
  "applicationStackName": "$APPLICATION_STACK_NAME",
  "certificateArn": "$CERTIFICATE_ARN",
  "hostedZoneId": "$HOSTED_ZONE_ID",
  "ecrRepositoryName": "$ECR_REPOSITORY_NAME",
  "imageTag": "$IMAGE_TAG",
  "adminRoleName": "$ADMIN_ROLE_NAME",
  "awsRegion": "$AWS_REGION",
  "noRollback": "$NO_ROLLBACK",
  "deployInfrastructure": "$DEPLOY_INFRASTRUCTURE",
  "deployApplication": "$DEPLOY_APPLICATION",
  "lastDeployment": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    echo "Configuration saved to $CONFIG_FILE"
}

# Check for help flag
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    echo "Usage: $0"
    echo ""
    echo "Interactive deployment script for MCP Server infrastructure."
    echo "Configuration is saved and reused between deployments."
    echo ""
    echo "On first run, you'll be prompted for all configuration values."
    echo "On subsequent runs, previous values are shown as defaults."
    echo ""
    exit 0
fi

# Load existing config or prompt for new one
if ! load_config; then
    prompt_config
fi

# Validate certificate and hosted zone pairing
if [ -n "$CERTIFICATE_ARN" ] && [ -z "$HOSTED_ZONE_ID" ]; then
    echo "ERROR: Hosted zone ID is required when using certificate"
    exit 1
fi

if [ -n "$HOSTED_ZONE_ID" ] && [ -z "$CERTIFICATE_ARN" ]; then
    echo "ERROR: Certificate ARN is required when using hosted zone ID"
    exit 1
fi



# Check if the ECR repository exists if deploying application stack
if [ "$DEPLOY_APPLICATION" = "true" ]; then
    echo "Checking if ECR repository '$ECR_REPOSITORY_NAME' exists..."
    if ! aws ecr describe-repositories --repository-names "$ECR_REPOSITORY_NAME" --region "$AWS_REGION" &> /dev/null; then
        echo "ECR repository '$ECR_REPOSITORY_NAME' does not exist. Building and pushing image..."
        
        # Run the pushDockerImage script
        SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
        if [ -f "$SCRIPT_DIR/../src/scripts/pushDockerImage.sh" ]; then
            echo "Running pushDockerImage.sh script..."
            cd "$SCRIPT_DIR/../src"
            ./scripts/pushDockerImage.sh
            cd "$SCRIPT_DIR"
        else
            echo "ERROR: pushDockerImage.sh script not found at $SCRIPT_DIR/../src/scripts/pushDockerImage.sh"
            exit 1
        fi
    else
        echo "ECR repository '$ECR_REPOSITORY_NAME' exists. Proceeding with deployment."
    fi
fi

# Save configuration before deployment
save_config

# Bootstrap CDK (if not already done)
echo "🔧 Bootstrapping CDK..."
npx cdk bootstrap

# Set environment variables for deployment
export CERTIFICATE_ARN="$CERTIFICATE_ARN"
export HOSTED_ZONE_ID="$HOSTED_ZONE_ID"

# Get domain name from certificate if provided
if [ -n "$CERTIFICATE_ARN" ]; then
    echo "Getting domain name from certificate..."
    DOMAIN_NAME=$(aws acm describe-certificate --certificate-arn "$CERTIFICATE_ARN" --query "Certificate.DomainName" --output text --region "$AWS_REGION")
    if [ $? -eq 0 ] && [ -n "$DOMAIN_NAME" ]; then
        echo "Certificate domain: $DOMAIN_NAME"
        export DOMAIN_NAME="$DOMAIN_NAME"
    else
        echo "ERROR: Failed to get domain name from certificate"
        exit 1
    fi
fi

export ECR_REPOSITORY_NAME="$ECR_REPOSITORY_NAME"
export IMAGE_TAG="$IMAGE_TAG"
export ADMIN_ROLE_NAME="$ADMIN_ROLE_NAME"
export AWS_REGION="$AWS_REGION"

# Deploy the stacks
if [ "$DEPLOY_INFRASTRUCTURE" = "true" ]; then
    echo "Deploying MCP Server infrastructure stack '$INFRASTRUCTURE_STACK_NAME' with the following configuration:"
    if [ -n "$ADMIN_ROLE_NAME" ]; then
        echo "  Admin Role: $ADMIN_ROLE_NAME"
    fi
    echo "  AWS Region: $AWS_REGION"
    echo "  No Rollback: $NO_ROLLBACK"
    
    echo "Starting MCP Server infrastructure deployment..."
    if [ "$NO_ROLLBACK" = "true" ]; then
        npx cdk deploy "$INFRASTRUCTURE_STACK_NAME" --require-approval never --no-rollback --exclusively $CDK_CONTEXT_ARGS
    else
        npx cdk deploy "$INFRASTRUCTURE_STACK_NAME" --require-approval never --exclusively $CDK_CONTEXT_ARGS
    fi
    
    # Check if infrastructure deployment was successful
    if [ $? -ne 0 ]; then
        echo "MCP Server infrastructure deployment failed. Exiting."
        exit 1
    fi
    
    echo "MCP Server infrastructure deployment successful!"
fi

if [ "$DEPLOY_APPLICATION" = "true" ]; then
    echo "Deploying MCP Server application stack '$APPLICATION_STACK_NAME' with the following configuration:"
    if [ -n "$CERTIFICATE_ARN" ]; then
        echo "  Certificate ARN: $CERTIFICATE_ARN"
    else
        echo "  HTTPS: Disabled"
    fi
    echo "  ECR Repository: $ECR_REPOSITORY_NAME"
    echo "  Image Tag: $IMAGE_TAG"
    echo "  AWS Region: $AWS_REGION"
    echo "  No Rollback: $NO_ROLLBACK"
    
    echo "Starting MCP Server application deployment..."
    if [ "$NO_ROLLBACK" = "true" ]; then
        npx cdk deploy "$APPLICATION_STACK_NAME" --require-approval never --no-rollback --exclusively $CDK_CONTEXT_ARGS
    else
        npx cdk deploy "$APPLICATION_STACK_NAME" --require-approval never --exclusively $CDK_CONTEXT_ARGS
    fi
    
    # Check if application deployment was successful
    if [ $? -ne 0 ]; then
        echo "MCP Server application deployment failed. Check the CloudFormation events for more information."
        exit 1
    fi
    
    echo "MCP Server application deployment successful!"
    
    # Get the service URL (which includes the proper protocol and domain)
    SERVICE_URL=$(aws cloudformation describe-stacks --stack-name "$APPLICATION_STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='MCPServerServiceURL'].OutputValue" --output text --region "$AWS_REGION" 2>/dev/null)
    
    if [ -n "$SERVICE_URL" ]; then
        echo ""
        echo "MCP Server URL: $SERVICE_URL"
    fi
fi


DCR_API_URL=$(aws cloudformation describe-stacks --stack-name "$INFRASTRUCTURE_STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DCRApiGatewayUrl'].OutputValue" --output text --region "$AWS_REGION" 2>/dev/null)
OPENID_CONFIG_URL=$(aws cloudformation describe-stacks --stack-name "$INFRASTRUCTURE_STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DCROpenIDConfigurationUrl'].OutputValue" --output text --region "$AWS_REGION" 2>/dev/null)
REGISTRATION_URL=$(aws cloudformation describe-stacks --stack-name "$INFRASTRUCTURE_STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DCRRegistrationEndpoint'].OutputValue" --output text --region "$AWS_REGION" 2>/dev/null)


# Final summary
echo ""
echo "🎯 Deployment Summary"
echo "===================="
if [ "$DEPLOY_INFRASTRUCTURE" = "true" ]; then
    echo "✅ Infrastructure Stack: $INFRASTRUCTURE_STACK_NAME"
    echo "   DCR Enabled: Dynamic Client Registration and OpenID Configuration deployed"
  
fi
if [ "$DEPLOY_APPLICATION" = "true" ]; then
    echo "✅ Application Stack: $APPLICATION_STACK_NAME"
    if [ -n "$SERVICE_URL" ]; then
        echo "   Service URL: $SERVICE_URL"
        if [ -n "$CERTIFICATE_ARN" ] && [ -n "$HOSTED_ZONE_ID" ]; then
            echo "   DNS: Automatically configured"
        fi
    fi
fi

echo ""
echo "🚀 All deployments completed successfully!"

if [ "$DEPLOY_APPLICATION" = "true" ] && [ -n "$SERVICE_URL" ]; then
    echo ""
    echo "MCP Server Next Steps:"
    if [ -n "$CERTIFICATE_ARN" ] && [ -n "$HOSTED_ZONE_ID" ]; then
        echo "1. DNS records have been automatically configured"
        echo "2. Test your MCP Server at $SERVICE_URL/mcp"
    else
        echo "1. Set up DNS records pointing to the ALB"
        echo "2. Test your MCP Server at $SERVICE_URL/mcp"
    fi
fi


echo ""
echo "🔐 OAuth Endpoints Available:"
if [ -n "$OPENID_CONFIG_URL" ]; then
    echo "   OpenID Configuration: $OPENID_CONFIG_URL"
fi
if [ -n "$REGISTRATION_URL" ]; then
    echo "   Dynamic Client Registration: $REGISTRATION_URL"
fi
echo ""
echo "🧪 Test Commands:"
if [ -n "$OPENID_CONFIG_URL" ]; then
    echo "   # Test OpenID Configuration"
    echo "   curl $OPENID_CONFIG_URL"
fi
if [ -n "$REGISTRATION_URL" ]; then
    echo ""
    echo "   # Register a new OAuth client"
    echo "   curl -X POST $REGISTRATION_URL \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"redirect_uris\":[\"http://localhost:3000/callback\"],\"client_name\":\"Test Client\"}'"
fi

