import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

export interface ApplicationStackProps extends cdk.StackProps {
  // Resources from the ServicesStack
  mcpServerTravelBookingsTable: dynamodb.Table;
  mcpServerPolicyBucket: s3.Bucket;
  mcpServerTaskRole: iam.Role;
  mcpServerDataAccessRole: iam.Role;
  mcpServerUserPool: cognito.UserPool;
  mcpServerUserPoolDomain: cognito.UserPoolDomain;
  // Optional DCR integration
  dcrApiUrl?: string;
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    // Define the repository name
    const repositoryName = process.env.ECR_REPOSITORY_NAME || "mcp-server-on-ecs";
    
    // Use existing repository - we assume it's already created by the server script
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'MCPServerEcrRepository',
      repositoryName
    );

    // Use the image tag from environment variable or default to 'latest'
    const imageTag = process.env.IMAGE_TAG || 'latest';

    // Create the ECS service with ALB
    const mcpServerService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "MCPServerFargateService",
      {
        memoryLimitMiB: 1024,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
          environment: {
            TABLE_NAME: props.mcpServerTravelBookingsTable.tableName,
            ROLE_ARN: props.mcpServerDataAccessRole.roleArn,
            BUCKET_NAME: props.mcpServerPolicyBucket.bucketName,
            COGNITO_USER_POOL_ID: props.mcpServerUserPool.userPoolId,
            COGNITO_DOMAIN: props.mcpServerUserPoolDomain.domainName,
            AWS_REGION: this.region,
            // DCR integration - can be enabled by passing dcrApiUrl
            DCR_ENABLED: props.dcrApiUrl ? 'true' : 'false',
            ...(props.dcrApiUrl && {
              AUTHORIZATION_SERVER_WITH_DCR_URL: props.dcrApiUrl,
              REGISTRATION_ENDPOINT_URL: `${props.dcrApiUrl}/register`
            })
          },
          containerPort: 3000,
          taskRole: props.mcpServerTaskRole,
        },
        desiredCount: 1,
        minHealthyPercent: 100,
        publicLoadBalancer: true,
        loadBalancerName: "MCPServer", // Set a specific name prefix for the ALB
      }
    );

    // Add HTTPS listener if certificate ARN is provided
    if (!!process.env.CERTIFICATE_ARN)
      mcpServerService.loadBalancer.addListener("MCPServerHttpsListener", {
        port: 443,
        defaultTargetGroups: [mcpServerService.targetGroup],
        certificates: [
          {
            certificateArn: process.env.CERTIFICATE_ARN,
          },
        ],
      });
    else console.log("CERTIFICATE_ARN is not set, not adding HTTPS listener.");

    // Create Route 53 record if both certificate and hosted zone are provided
    if (process.env.CERTIFICATE_ARN && process.env.HOSTED_ZONE_ID && process.env.DOMAIN_NAME) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
        this,
        'ImportedHostedZone',
        {
          hostedZoneId: process.env.HOSTED_ZONE_ID,
          zoneName: process.env.DOMAIN_NAME.includes('.') 
            ? process.env.DOMAIN_NAME.split('.').slice(-2).join('.') // Get root domain from subdomain
            : process.env.DOMAIN_NAME
        }
      );

      new route53.ARecord(this, 'MCPServerAliasRecord', {
        zone: hostedZone,
        recordName: process.env.DOMAIN_NAME,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.LoadBalancerTarget(mcpServerService.loadBalancer)
        ),
      });
    }

    // Configure health check
    mcpServerService.targetGroup.configureHealthCheck({
      path: "/health",
      port: "3000",
    });

    // Add RESOURCE_SERVER_URL environment variable after service creation
    const taskDefinition = mcpServerService.taskDefinition;
    const container = taskDefinition.defaultContainer;
    if (container) {
      let resourceServerUrl: string;
      
      // Use custom domain if certificate, hosted zone, and domain name are provided
      if (process.env.CERTIFICATE_ARN && process.env.HOSTED_ZONE_ID && process.env.DOMAIN_NAME) {
        resourceServerUrl = `https://${process.env.DOMAIN_NAME}`;
      } else {
        // Fall back to load balancer DNS with HTTP only
        const loadBalancerDnsName = mcpServerService.loadBalancer.loadBalancerDnsName;
        resourceServerUrl = `http://${loadBalancerDnsName}`;
      }
      
      container.addEnvironment('RESOURCE_SERVER_URL', resourceServerUrl);
    };
    
    // Output the ALB DNS name
    new cdk.CfnOutput(this, 'MCPServerLoadBalancerDns', {
      value: mcpServerService.loadBalancer.loadBalancerDnsName,
      description: 'The DNS name of the MCP Server load balancer',
      exportName: 'MCPServerLoadBalancerDns',
    });

    // Output the service URL
    const serviceUrl = process.env.CERTIFICATE_ARN && process.env.HOSTED_ZONE_ID && process.env.DOMAIN_NAME
      ? `https://${process.env.DOMAIN_NAME}`
      : `http://${mcpServerService.loadBalancer.loadBalancerDnsName}`;
      
    new cdk.CfnOutput(this, 'MCPServerServiceURL', {
      value: serviceUrl,
      description: 'The URL of the MCP Server service',
      exportName: 'MCPServerServiceURL',
    });
  }
}
