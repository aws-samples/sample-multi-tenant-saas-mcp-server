#!/bin/bash

# Exit on any error
set -e

# Default values
export ECR_REPO=${ECR_REPO:-mcp-server-on-ecs}
export ECR_IMAGE_TAG=${ECR_IMAGE_TAG:-latest}
export AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query 'Account' --output text)}
export AWS_REGION=${AWS_REGION:-us-east-1}
export ECR_REPO_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$ECR_IMAGE_TAG
export LOCAL_TAG=${LOCAL_TAG:-mcp-server:latest}

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Detect available container tools
DOCKER_AVAILABLE=false
FINCH_AVAILABLE=false

if command_exists docker; then
  DOCKER_AVAILABLE=true
fi

if command_exists finch; then
  FINCH_AVAILABLE=true
fi

# Select container tool
CONTAINER_TOOL=""

if [ "$DOCKER_AVAILABLE" = true ] && [ "$FINCH_AVAILABLE" = true ]; then
  echo "Both Docker and Finch are available."
  read -p "Which tool do you want to use? (docker/finch) " TOOL_CHOICE
  if [[ $TOOL_CHOICE == "docker" ]]; then
    CONTAINER_TOOL="docker"
  elif [[ $TOOL_CHOICE == "finch" ]]; then
    CONTAINER_TOOL="finch"
  else
    echo "Invalid choice. Exiting."
    exit 1
  fi
elif [ "$DOCKER_AVAILABLE" = true ]; then
  CONTAINER_TOOL="docker"
  echo "Using Docker for container operations."
elif [ "$FINCH_AVAILABLE" = true ]; then
  CONTAINER_TOOL="finch"
  echo "Using Finch for container operations."
else
  echo "Neither Docker nor Finch is available. Please install one of them and try again."
  exit 1
fi

# Get the script's directory and navigate to the parent directory (src)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PARENT_DIR="$( dirname "$SCRIPT_DIR" )"
cd "$PARENT_DIR"
echo "Changed to directory: $(pwd) for build operations"

# Increment app version
echo "Incrementing app version..."
npm version patch

# Build image
echo "Building MCP Server image..."

# Check if running in SageMaker environment
if [[ "$HOME" == *"sagemaker-user"* ]]; then
  NETWORK_OPTION="--network sagemaker"
  echo "Detected SageMaker environment, using network option: $NETWORK_OPTION"
else
  NETWORK_OPTION=""
fi

if [ "$CONTAINER_TOOL" = "docker" ]; then
  docker buildx build --platform linux/arm64 $NETWORK_OPTION -t $LOCAL_TAG --load .
  
  # Tag with ECR URI if specified
  if [ -n "$ECR_REPO_URI" ]; then
    docker tag $LOCAL_TAG $ECR_REPO_URI
    echo "Image tagged as $ECR_REPO_URI"
  fi
else
  finch build --platform linux/arm64 $NETWORK_OPTION --provenance=false -t $LOCAL_TAG .
  
  # Tag with ECR URI if specified
  if [ -n "$ECR_REPO_URI" ]; then
    finch tag $LOCAL_TAG $ECR_REPO_URI
    echo "Image tagged as $ECR_REPO_URI"
  fi
fi

echo "MCP Server image successfully built as $LOCAL_TAG"
