#!/bin/bash
set -e

export ECR_REPO=${ECR_REPO:-mcp-server-on-ecs}
export ECR_IMAGE_TAG=${ECR_IMAGE_TAG:-latest}
export AWS_REGION=${AWS_REGION:-us-east-1}

echo "Getting AWS Account ID..."
export AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query 'Account' --output text)}
if [ -z "$AWS_ACCOUNT_ID" ]; then
  echo "Error: Failed to get AWS Account ID. Please check your AWS credentials."
  exit 1
fi

export ECR_REPO_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$ECR_IMAGE_TAG

# Detect container tool
if command -v docker &> /dev/null; then
  CTR=docker
elif command -v finch &> /dev/null; then
  CTR=finch
else
  echo "Neither docker nor finch found. Please install one."
  exit 1
fi
echo "Using $CTR"

# Create repository if it doesn't exist
if ! aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION &> /dev/null; then
  echo "Creating ECR repository '$ECR_REPO'..."
  aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION --no-cli-pager
fi

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | $CTR login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build the image
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
$SCRIPT_DIR/buildDockerImage.sh

# Push
echo "Pushing image to ECR..."
$CTR push $ECR_REPO_URI

echo "✅ Image pushed: $ECR_REPO_URI"
