import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface ApplicationStackProps extends cdk.StackProps {
  mcpServerTravelBookingsTable: dynamodb.Table;
  mcpServerPolicyBucket: s3.Bucket;
  mcpServerTaskRole: iam.Role;
  mcpServerDataAccessRole: iam.Role;
  mcpServerUserPool: cognito.UserPool;
  mcpServerUserPoolDomain: cognito.UserPoolDomain;
  dcrApiUrl?: string;
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    const repositoryName = process.env.ECR_REPOSITORY_NAME ?? "mcp-server-on-ecs";
    const imageTag = process.env.IMAGE_TAG ?? "latest";

    const repository = ecr.Repository.fromRepositoryName(this, "MCPServerEcrRepository", repositoryName);

    const executionRole = new iam.Role(this, "ExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    const infraRole = new iam.Role(this, "InfraRole", {
      assumedBy: new iam.ServicePrincipal("ecs.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSInfrastructureRoleforExpressGatewayServices"
        ),
      ],
    });

    const service = new ecs.CfnExpressGatewayService(this, "MCPServer", {
      serviceName: "mcp-server",
      executionRoleArn: executionRole.roleArn,
      infrastructureRoleArn: infraRole.roleArn,
      taskRoleArn: props.mcpServerTaskRole.roleArn,
      cpu: "1024",
      memory: "2048",
      healthCheckPath: "/health",
      primaryContainer: {
        image: `${repository.repositoryUri}:${imageTag}`,
        containerPort: 3000,
        environment: [
          { name: "TABLE_NAME", value: props.mcpServerTravelBookingsTable.tableName },
          { name: "ROLE_ARN", value: props.mcpServerDataAccessRole.roleArn },
          { name: "BUCKET_NAME", value: props.mcpServerPolicyBucket.bucketName },
          { name: "COGNITO_USER_POOL_ID", value: props.mcpServerUserPool.userPoolId },
          { name: "COGNITO_DOMAIN", value: props.mcpServerUserPoolDomain.domainName },
          { name: "AWS_REGION", value: cdk.Aws.REGION },
          { name: "DCR_ENABLED", value: props.dcrApiUrl ? "true" : "false" },
          ...(props.dcrApiUrl
            ? [
                { name: "AUTHORIZATION_SERVER_WITH_DCR_URL", value: props.dcrApiUrl },
                { name: "REGISTRATION_ENDPOINT_URL", value: `${props.dcrApiUrl}/register` },
              ]
            : []),
        ],
      },
    });

    // Register a Cognito Resource Server with identifier equal to the MCP
    // server's public endpoint. This is required so Cognito accepts the
    // `resource` parameter (RFC 8707 Resource Indicators) that mcp-use/MCP SDK
    // sends on /authorize and /token. The advertised `resource` in the
    // server's RFC 9728 protected-resource metadata is derived from the
    // request Host at runtime, which for the ECS Express Gateway service is
    // `https://${service.attrEndpoint}` — we use the same value here so the
    // identifiers match exactly.
    //
    // Cognito matches resource-server identifiers by exact string, and
    // mcp-use normalizes the resource value via `new URL(serverUrl)` which
    // appends a trailing slash when the path is empty. We therefore register
    // the identifier WITH a trailing slash.
    const resourceIdentifier = `https://${service.attrEndpoint}/`;
    new cognito.CfnUserPoolResourceServer(this, "MCPServerResourceServer", {
      userPoolId: props.mcpServerUserPool.userPoolId,
      identifier: resourceIdentifier,
      name: "MCP Server",
    });

    new cdk.CfnOutput(this, "Endpoint", { value: service.attrEndpoint });
    new cdk.CfnOutput(this, "ResourceServerIdentifier", {
      value: resourceIdentifier,
      description: "Cognito resource server identifier for RFC 8707 resource indicators",
    });
  }
}
