#!/bin/bash
set -e

export ECR_REPO=${ECR_REPO:-mcp-server-on-ecs}
export ECR_IMAGE_TAG=${ECR_IMAGE_TAG:-latest}
export AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query 'Account' --output text)}
export AWS_REGION=${AWS_REGION:-us-east-1}
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

# Navigate to src directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$( dirname "$SCRIPT_DIR" )"
echo "Building in: $(pwd)"

# Build app (Dockerfile expects pre-built dist/)
echo "Running npm run build..."
npm run build

# Build container image (linux/amd64 required by ECS Express Mode)
echo "Building container image..."
$CTR build --platform linux/amd64 -t $ECR_REPO_URI .

echo "✅ Image built: $ECR_REPO_URI"
echo "Push with: $CTR push $ECR_REPO_URI"
