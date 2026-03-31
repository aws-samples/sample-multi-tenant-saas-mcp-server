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

    const repositoryName = process.env.ECR_REPOSITORY_NAME || "mcp-server-on-ecs";
    const imageTag = process.env.IMAGE_TAG || "latest";

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

    new cdk.CfnOutput(this, "Endpoint", { value: service.attrEndpoint });
  }
}
