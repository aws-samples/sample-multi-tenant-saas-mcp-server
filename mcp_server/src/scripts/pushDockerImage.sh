#!/bin/bash

# Exit on any error
set -e

# Default values
export ECR_REPO=${ECR_REPO:-mcp-server-on-ecs}
export ECR_IMAGE_TAG=${ECR_IMAGE_TAG:-latest}
export AWS_REGION=${AWS_REGION:-us-east-1}

# Get AWS Account ID with error handling
echo "Getting AWS Account ID..."
export AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query 'Account' --output text)}
if [ -z "$AWS_ACCOUNT_ID" ]; then
  echo "Error: Failed to get AWS Account ID. Please check your AWS credentials."
  exit 1
fi

export ECR_REPO_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$ECR_IMAGE_TAG

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

# Check if the ECR repository exists
echo "Checking if ECR repository '$ECR_REPO' exists..."
REPO_EXISTS=false
if aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION &> /dev/null; then
  REPO_EXISTS=true
  echo "ECR repository '$ECR_REPO' exists."
  read -p "Do you want to use the existing repository? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Exiting. Please use a different repository name or confirm using the existing one."
    exit 1
  fi
else
  echo "ECR repository '$ECR_REPO' does not exist. Will create it."
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

# Create repository if it doesn't exist
if [ "$REPO_EXISTS" = false ]; then
  echo "Creating ECR repository..."
  aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION --no-cli-pager
fi

# Login to ECR
echo "Logging in to ECR..."
if [ "$CONTAINER_TOOL" = "docker" ]; then
  aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
else
  aws ecr get-login-password --region $AWS_REGION | finch login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
fi

# Build the Docker image using buildDockerImage.sh
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
echo "Building MCP Server image for $ECR_REPO_URI..."
if ! $SCRIPT_DIR/buildDockerImage.sh; then
  echo "Error: Docker image build failed."
  exit 1
fi

# Push the image to ECR
echo "Pushing MCP Server image to ECR..."
if [ "$CONTAINER_TOOL" = "docker" ]; then
  docker push $ECR_REPO_URI
else
  finch push $ECR_REPO_URI
fi

echo "MCP Server image successfully pushed to $ECR_REPO_URI"
