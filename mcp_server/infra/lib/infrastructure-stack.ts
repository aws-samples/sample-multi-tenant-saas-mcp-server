import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ecr from "aws-cdk-lib/aws-ecr";

import * as path from "path";
import { Construct } from "constructs";
import { Policy } from "aws-cdk-lib/aws-iam";

export interface InfrastructureStackProps extends cdk.StackProps {
  // Optional props that can be passed from the parent stack
}

export class InfrastructureStack extends cdk.Stack {
  // Export these resources to be used by the ApplicationStack
  public readonly mcpServerTravelBookingsTable: dynamodb.Table;
  public readonly mcpServerPolicyBucket: s3.Bucket;
  public readonly mcpServerTaskRole: iam.Role;
  public readonly mcpServerDataAccessRole: iam.Role;
  public readonly mcpServerS3AccessRole: iam.Role;
  public readonly mcpServerUserPool: cognito.UserPool;
  public readonly mcpServerUserPoolDomain: cognito.UserPoolDomain;

  public readonly postConfirmationLambda: lambda.Function;
  public readonly preTokenGenerationLambda: lambda.Function;
  
  // DCR resources (conditional)
  public readonly dcrApi?: apigateway.RestApi;
  public readonly dcrApiUrl?: string;
  public readonly dcrCloudFrontDistribution?: cloudfront.Distribution;
  public readonly openidConfigurationUrl?: string;

  constructor(scope: Construct, id: string, props?: InfrastructureStackProps) {
    super(scope, id, props);

    // Create the task role for ECS
    this.mcpServerTaskRole = new iam.Role(this, "MCPServerTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    this.mcpServerTaskRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("ecs-tasks.amazonaws.com")],
        actions: ["sts:AssumeRole"],
        conditions: {
          ArnLike: {
            "aws:SourceArn": `arn:aws:ecs:${this.region}:${this.account}:*`
          },
          StringEquals: {
            "aws:SourceAccount": this.account
          }
        }
      })
    );

    // Create the S3 bucket
    this.mcpServerPolicyBucket = new s3.Bucket(this, "MCPServerTravelPolicyBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Bucket will be deleted when stack is destroyed
      enforceSSL: true, // Require SSL/HTTPS for all requests
    });

    // Create Lambda function for post-confirmation tenant assignment
    this.postConfirmationLambda = new lambda.Function(this, "PostConfirmationLambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "post-confirmation-handler.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/post-confirmation")),
      timeout: cdk.Duration.seconds(30),
      description: "Assigns tenant information to users after email confirmation",
      environment: {
        POLICY_BUCKET_NAME: this.mcpServerPolicyBucket.bucketName,
      },
    });

    // Grant the post-confirmation Lambda permission to write to the S3 bucket
    this.mcpServerPolicyBucket.grantPut(this.postConfirmationLambda);

    // Create Lambda function for pre-token generation
    this.preTokenGenerationLambda = new lambda.Function(this, "PreTokenGenerationLambda", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "pre-token-generation-handler.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/pre-token-generation")),
      timeout: cdk.Duration.seconds(30),
      description: "Adds custom attributes to access tokens",
    });

    // Create Cognito User Pool for authentication
    this.mcpServerUserPool = new cognito.UserPool(this, "MCPServerUserPool", {
      userPoolName: "mcp-server-users",
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: false,
          mutable: true,
        },
        familyName: {
          required: false,
          mutable: true,
        },
      },
      customAttributes: {
        tenantId: new cognito.StringAttribute({ 
          mutable: true,
          minLen: 1,
          maxLen: 50,
        }),
        tenantTier: new cognito.StringAttribute({ 
          mutable: true,
          minLen: 1,
          maxLen: 20,
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // We'll add the Lambda trigger after creating the Lambda function
    });

    // Now add the Lambda triggers to the User Pool using CloudFormation directly
    const cfnUserPool = this.mcpServerUserPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.lambdaConfig = {
      postConfirmation: this.postConfirmationLambda.functionArn,
      preTokenGeneration: this.preTokenGenerationLambda.functionArn,
      preTokenGenerationConfig: {
        lambdaVersion: 'V2_0',
        lambdaArn: this.preTokenGenerationLambda.functionArn,
      },
    };
    
    // Grant Cognito permission to invoke the Lambda functions
    // Use a string concatenation instead of direct reference to break circular dependency
    new lambda.CfnPermission(this, 'CognitoInvokePostConfirmationLambda', {
      action: 'lambda:InvokeFunction',
      functionName: this.postConfirmationLambda.functionName,
      principal: 'cognito-idp.amazonaws.com',
      sourceArn: `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${this.mcpServerUserPool.userPoolId}`,
    });

    new lambda.CfnPermission(this, 'CognitoInvokePreTokenGenerationLambda', {
      action: 'lambda:InvokeFunction',
      functionName: this.preTokenGenerationLambda.functionName,
      principal: 'cognito-idp.amazonaws.com',
      sourceArn: `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${this.mcpServerUserPool.userPoolId}`,
    });

    //Create User Pool Domain for new Hosted UI - Currently limited to 10 App Clients
    this.mcpServerUserPoolDomain = this.mcpServerUserPool.addDomain("MCPServerDomain", {
      cognitoDomain: {
        domainPrefix: `mcp-server-${cdk.Stack.of(this).account}`,
      },
      managedLoginVersion: 2
    });

    // Grant Lambda permission to update Cognito user attributes (specific to this User Pool)
    this.postConfirmationLambda.role!.attachInlinePolicy(
      new Policy(this, "UserPoolPolicy", {
          statements: [new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cognito-idp:AdminUpdateUserAttributes",
            "cognito-idp:AdminGetUser",
          ],
          resources: [this.mcpServerUserPool.userPoolArn]})]
        })
      );

    // Create the DynamoDB table
    this.mcpServerTravelBookingsTable = new dynamodb.Table(this, "MCPServerTravelBookings", {
      tableName: "MCPServerTravelBookings",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Table will be deleted when stack is destroyed
    });

    // Create the DynamoDB table for tracking public OAuth clients
    const publicClientsTable = new dynamodb.Table(this, "MCPServerPublicClientsTable", {
      tableName: "MCPServerPublicClients",
      partitionKey: { name: "clientKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production
    });

    // Create the data access role for multi-tenant DynamoDB and S3 access
    this.mcpServerDataAccessRole = new iam.Role(this, "MCPServerDataAccessRole", {
      assumedBy: this.mcpServerTaskRole,
      description: "Role for multi-tenant data access for MCP Server",
    });
    
    // Add S3 permissions to the data access role with tenant-based conditions
    this.mcpServerDataAccessRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [this.mcpServerPolicyBucket.bucketArn],
        conditions: {
          "StringLike": {
            "s3:prefix": ["${aws:PrincipalTag/tenantId}/*"]
          }
        }
      })
    );

    // Separate policy for GetObject with tenant-based path restriction
    this.mcpServerDataAccessRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [`${this.mcpServerPolicyBucket.bucketArn}/\${aws:PrincipalTag/tenantId}/*`]
      })
    );

    // Add DynamoDB permissions to the data access role
    this.mcpServerDataAccessRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
        ],
        resources: [this.mcpServerTravelBookingsTable.tableArn],
        conditions: {
          "ForAllValues:StringEquals": {
            "dynamodb:LeadingKeys": ["${aws:PrincipalTag/tenantId}"],
          },
        },
      })
    );

    // Handle admin role if provided
    if (!process.env.ADMIN_ROLE_NAME) {
      console.log("ADMIN_ROLE_NAME is not set, not adding to access role.");
    }

    const principals = !!process.env.ADMIN_ROLE_NAME
      ? [
          iam.Role.fromRoleName(this, "MCPServerAdminRole", process.env.ADMIN_ROLE_NAME),
          this.mcpServerTaskRole,
        ]
      : [this.mcpServerTaskRole];

    this.mcpServerDataAccessRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [this.mcpServerTaskRole],
        actions: ["sts:AssumeRole", "sts:TagSession"],
        conditions: {
          StringLike: { "aws:RequestTag/tenantId": "*" }
        }
      })
    );

    // Output the resource ARNs and names
    new cdk.CfnOutput(this, 'MCPServerDynamoDBTableName', {
      value: this.mcpServerTravelBookingsTable.tableName,
      description: 'The name of the MCP Server DynamoDB table',
      exportName: 'MCPServerTravelBookingsTableName',
    });

    new cdk.CfnOutput(this, 'MCPServerPublicClientsTableName', {
      value: publicClientsTable.tableName,
      description: 'The name of the MCP Server public clients DynamoDB table',
      exportName: 'MCPServerPublicClientsTableName',
    });

    new cdk.CfnOutput(this, 'MCPServerPolicyBucketName', {
      value: this.mcpServerPolicyBucket.bucketName,
      description: 'The name of the MCP Server policy S3 bucket',
      exportName: 'MCPServerTravelPolicyBucketName',
    });

    new cdk.CfnOutput(this, 'MCPServerTaskRoleArn', {
      value: this.mcpServerTaskRole.roleArn,
      description: 'The ARN of the MCP Server task role',
      exportName: 'MCPServerTaskRoleArn',
    });

    new cdk.CfnOutput(this, 'MCPServerDataAccessRoleArn', {
      value: this.mcpServerDataAccessRole.roleArn,
      description: 'The ARN of the MCP Server data access role',
      exportName: 'MCPServerDataAccessRoleArn',
    });

    new cdk.CfnOutput(this, 'MCPServerUserPoolId', {
      value: this.mcpServerUserPool.userPoolId,
      description: 'The ID of the MCP Server Cognito User Pool',
      exportName: 'MCPServerUserPoolId',
    });

    new cdk.CfnOutput(this, 'MCPServerUserPoolArn', {
      value: this.mcpServerUserPool.userPoolArn,
      description: 'The ARN of the MCP Server Cognito User Pool',
      exportName: 'MCPServerUserPoolArn',
    });

    new cdk.CfnOutput(this, 'MCPServerUserPoolDomain', {
      value: this.mcpServerUserPoolDomain.domainName,
      description: 'The domain name for the MCP Server Cognito Hosted UI',
      exportName: 'MCPServerUserPoolDomain',
    });

    new cdk.CfnOutput(this, 'MCPServerHostedUIUrl', {
      value: `https://${this.mcpServerUserPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'The full URL for the MCP Server Cognito Hosted UI',
      exportName: 'MCPServerHostedUIUrl',
    });

      
    // Create Lambda function for dynamic client registration
    const dcrFunction = new lambda.Function(this, 'DcrFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dcr.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dcr')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        COGNITO_USER_POOL_ID: this.mcpServerUserPool.userPoolId,
        PUBLIC_CLIENTS_TABLE: publicClientsTable.tableName,
      },
      description: 'RFC 7591 Dynamic Client Registration for MCP Server',
    });

    // Grant Lambda permission to create Cognito user pool clients
    dcrFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:CreateUserPoolClient',
        'cognito-idp:CreateManagedLoginBranding',
        'cognito-idp:ListUserPoolClients',
        'cognito-idp:DescribeUserPoolClient'
      ],
      resources: [this.mcpServerUserPool.userPoolArn],
    }));

    // Grant Lambda permission to read/write to public clients table
    publicClientsTable.grantReadWriteData(dcrFunction);

    // Create API Gateway REST API first
    this.dcrApi = new apigateway.RestApi(this, 'DcrApi', {
      restApiName: 'MCP Server DCR API',
      description: 'Dynamic Client Registration and OpenID Configuration for MCP Server',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: false,
        metricsEnabled: true
      },
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Mcp-Protocol-Version']
      },
      cloudWatchRole: true,
      failOnWarnings: false
    });

    // Construct the registration endpoint URL manually to avoid circular dependency
    const registrationEndpointUrl = `https://${this.dcrApi.restApiId}.execute-api.${this.region}.amazonaws.com/prod/register`;

    // Create Lambda function for OpenID Configuration
    const openidConfigFunction = new lambda.Function(this, 'OpenIDConfigFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'openid-config.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/openid-config')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        COGNITO_USER_POOL_ID: this.mcpServerUserPool.userPoolId,
        COGNITO_DOMAIN: this.mcpServerUserPoolDomain.domainName,
        DEPLOYMENT_REGION: this.region,
        REGISTRATION_ENDPOINT_URL: registrationEndpointUrl,
        STACK_NAME: this.stackName,
        STACK_REGION: this.region
      },
      description: 'RFC 8414 OpenID Configuration metadata for MCP Server',
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Create API Gateway resource and method for DCR
    const registerResource = this.dcrApi.root.addResource('register');
    registerResource.addMethod('POST', new apigateway.LambdaIntegration(dcrFunction));

    // Create .well-known resource for OpenID Configuration
    const wellKnownResource = this.dcrApi.root.addResource('.well-known');
    
    // WORKAROUND: /.well-known/openid-configuration is needed since Amazon Cognito does not 
    // allow customization of it but it is needed to provide Dynamic Client Registration feature
    const openidConfigResource = wellKnownResource.addResource('openid-configuration');
    
    // WORKAROUND: /.well-known/oauth-authorization-server route is only to make it available 
    // for Claude Desktop (and other older clients) that don't fallback to 
    // /.well-known/openid-configuration yet - was mostly fixed with 
    // https://github.com/modelcontextprotocol/typescript-sdk/pull/652
    const oauthAuthServerResource = wellKnownResource.addResource('oauth-authorization-server');
    
    const openidConfigIntegration = new apigateway.LambdaIntegration(openidConfigFunction, {
      proxy: true,
      allowTestInvoke: false
    });

    openidConfigResource.addMethod('GET', openidConfigIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Content-Type': true,
            'method.response.header.Cache-Control': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Headers': true
          }
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Content-Type': true,
            'method.response.header.Access-Control-Allow-Origin': true
          }
        }
      ]
    });

    // Add the same method for oauth-authorization-server endpoint
    oauthAuthServerResource.addMethod('GET', openidConfigIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Content-Type': true,
            'method.response.header.Cache-Control': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Headers': true
          }
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Content-Type': true,
            'method.response.header.Access-Control-Allow-Origin': true
          }
        }
      ]
    });

    // Grant Lambda permission to be invoked by API Gateway
    openidConfigFunction.addPermission('ApiGatewayInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: this.dcrApi.arnForExecuteApi('GET', '/.well-known/openid-configuration')
    });

    openidConfigFunction.addPermission('ApiGatewayInvokePermissionOAuth', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: this.dcrApi.arnForExecuteApi('GET', '/.well-known/oauth-authorization-server')
    });

    // WORKAROUND: CloudFront distribution in front of the API Gateway is only necessary 
    // to remove the /prod path from the API Gateway deployment because of Claude Desktop 
    // (and other older clients) - was mostly fixed with 
    // https://github.com/modelcontextprotocol/typescript-sdk/pull/652
    this.dcrCloudFrontDistribution = new cloudfront.Distribution(this, 'DcrCloudFrontDistribution', {
      defaultBehavior: {
        origin: new origins.RestApiOrigin(this.dcrApi, {
          originPath: '/prod'
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      comment: 'CloudFront distribution for DCR API without /prod path'
    });

    // Store URLs for use by ApplicationStack
    this.dcrApiUrl = `https://${this.dcrCloudFrontDistribution.distributionDomainName}`;
    this.openidConfigurationUrl = `${this.dcrApiUrl}/.well-known/openid-configuration`;

    // DCR Stack outputs
    new cdk.CfnOutput(this, 'DCRCloudFrontUrl', {
      value: this.dcrApiUrl,
      description: 'DCR CloudFront distribution URL (without /prod path)',
      exportName: `${this.stackName}-DCRCloudFrontUrl`
    });

    new cdk.CfnOutput(this, 'DCRApiGatewayUrl', {
      value: this.dcrApi.url.replace(/\/$/, ''),
      description: 'DCR API Gateway URL (with /prod path)',
      exportName: `${this.stackName}-DCRApiUrl`
    });

    new cdk.CfnOutput(this, 'DCROpenIDConfigurationUrl', {
      value: this.openidConfigurationUrl,
      description: 'OpenID Configuration endpoint URL',
      exportName: `${this.stackName}-OpenIDConfigUrl`
    });

    new cdk.CfnOutput(this, 'DCRRegistrationEndpoint', {
      value: `${this.dcrApiUrl}/register`,
      description: 'Dynamic Client Registration endpoint URL',
      exportName: `${this.stackName}-RegistrationEndpoint`
    });

    // Add tags to DCR resources
    cdk.Tags.of(dcrFunction).add('Component', 'DCR');
    cdk.Tags.of(openidConfigFunction).add('Component', 'DCR');
    cdk.Tags.of(this.dcrApi).add('Component', 'DCR');
  

    new cdk.CfnOutput(this, 'MCPServerPostConfirmationLambdaArn', {
      value: this.postConfirmationLambda.functionArn,
      description: 'The ARN of the Post-Confirmation Lambda function for tenant assignment',
      exportName: 'MCPServerPostConfirmationLambdaArn',
    });

    new cdk.CfnOutput(this, 'MCPServerPreTokenGenerationLambdaArn', {
      value: this.preTokenGenerationLambda.functionArn,
      description: 'The ARN of the Pre-Token Generation Lambda function for custom claims',
      exportName: 'MCPServerPreTokenGenerationLambdaArn',
    });
  }
}
