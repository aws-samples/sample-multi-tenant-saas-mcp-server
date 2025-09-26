import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as path from 'path';

export interface McpPlaygroundStackProps extends cdk.StackProps {
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
  zoneName?: string;
  externalDns?: boolean;
  enableCognito?: boolean;
}

export class McpPlaygroundStack extends cdk.Stack {
  public readonly userPool?: cognito.UserPool;
  public readonly userPoolClient?: cognito.UserPoolClient;
  public readonly identityPool?: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: McpPlaygroundStackProps) {
    super(scope, id, props);

    // Generate unique suffix for resource naming
    const uniqueSuffix = this.account.slice(-8);

    // Create Cognito User Pool if enabled (default: true)
    let authenticatedRole: iam.Role | undefined;
    let unauthenticatedRole: iam.Role | undefined;

    if (props.enableCognito !== false) {
      // Create User Pool
      this.userPool = new cognito.UserPool(this, 'McpPlaygroundUserPool', {
        userPoolName: `mcp-playground-users-${uniqueSuffix}`,
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
        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: false,
        },
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Default callback URLs
      const callbackUrls = [
        'http://localhost:5173/auth/callback',
        'http://localhost:3000/auth/callback',
      ];

      const logoutUrls = [
        'http://localhost:5173/',
        'http://localhost:3000/',
      ];

      // Add domain-specific URLs if provided
      if (props.domainName) {
        callbackUrls.push(`https://${props.domainName}/auth/callback`);
        logoutUrls.push(`https://${props.domainName}/`);
      }

      // Create User Pool Client
      this.userPoolClient = new cognito.UserPoolClient(this, 'McpPlaygroundUserPoolClient', {
        userPool: this.userPool,
        userPoolClientName: `mcp-playground-client-${uniqueSuffix}`,
        generateSecret: false, // For SPA applications
        authFlows: {
          userSrp: true,
          userPassword: false, // Disable for security
          adminUserPassword: false,
        },
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
            implicitCodeGrant: false, // Deprecated for security
          },
          scopes: [
            cognito.OAuthScope.EMAIL,
            cognito.OAuthScope.OPENID,
            cognito.OAuthScope.PROFILE,
          ],
          callbackUrls,
          logoutUrls,
        },
        preventUserExistenceErrors: true,
        refreshTokenValidity: cdk.Duration.days(30),
        accessTokenValidity: cdk.Duration.hours(1),
        idTokenValidity: cdk.Duration.hours(1),
      });

      // Create User Pool Domain
      const userPoolDomain = new cognito.UserPoolDomain(this, 'McpPlaygroundUserPoolDomain', {
        userPool: this.userPool,
        cognitoDomain: {
          domainPrefix: `mcp-playground-${uniqueSuffix}`,
        },
      });

      // Create Identity Pool for AWS resource access
      this.identityPool = new cognito.CfnIdentityPool(this, 'McpPlaygroundIdentityPool', {
        identityPoolName: `mcp_playground_identity_pool_${uniqueSuffix}`,
        allowUnauthenticatedIdentities: false,
        cognitoIdentityProviders: [
          {
            clientId: this.userPoolClient.userPoolClientId,
            providerName: this.userPool.userPoolProviderName,
          },
        ],
      });

      // Create IAM roles for authenticated users
      authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
        roleName: `mcp-playground-auth-role-${uniqueSuffix}`,
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'authenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
      });

      // Add permissions for authenticated users
      authenticatedRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            // Bedrock permissions for AI model access
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:ListFoundationModels',
            // CloudWatch logs for debugging
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: ['*'],
        })
      );

      // Create IAM role for unauthenticated users (minimal permissions)
      unauthenticatedRole = new iam.Role(this, 'CognitoUnauthenticatedRole', {
        roleName: `mcp-playground-unauth-role-${uniqueSuffix}`,
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'unauthenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
      });

      // Attach roles to identity pool
      new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
        identityPoolId: this.identityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
          unauthenticated: unauthenticatedRole.roleArn,
        },
      });
    }

    // S3 Bucket for hosting the React frontend
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `mcp-playground-frontend-${uniqueSuffix}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) },
        { noncurrentVersionExpiration: cdk.Duration.days(7) },
      ],
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create Origin Access Identity for CloudFront
    const cfOriginAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'cfOriginAccessIdentity', {
      comment: 'OAI for MCP Playground website',
    });

    // Grant CloudFront OAI access to S3 bucket using resource policy
    const cloudfrontS3Access = new iam.PolicyStatement();
    cloudfrontS3Access.addActions('s3:GetBucket*');
    cloudfrontS3Access.addActions('s3:GetObject*');
    cloudfrontS3Access.addActions('s3:List*');
    cloudfrontS3Access.addResources(websiteBucket.bucketArn);
    cloudfrontS3Access.addResources(`${websiteBucket.bucketArn}/*`);
    cloudfrontS3Access.addCanonicalUserPrincipal(
      cfOriginAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
    );
    websiteBucket.addToResourcePolicy(cloudfrontS3Access);

    // Lambda function for the backend API using NodejsFunction for automatic bundling
    const lambdaEnvironment: Record<string, string> = {
      NODE_ENV: 'production',
    };

    // Add Cognito configuration to Lambda environment
    if (this.userPool && this.userPoolClient && this.identityPool) {
      lambdaEnvironment.COGNITO_USER_POOL_ID = this.userPool.userPoolId;
      lambdaEnvironment.COGNITO_CLIENT_ID = this.userPoolClient.userPoolClientId;
      lambdaEnvironment.COGNITO_IDENTITY_POOL_ID = this.identityPool.ref;
      lambdaEnvironment.COGNITO_REGION = this.region;
    }

    const apiLambda = new nodejs.NodejsFunction(this, 'ApiLambda', {
      functionName: `mcp-playground-api-${uniqueSuffix}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../lambda/api-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: lambdaEnvironment,
      bundling: {
        externalModules: [
          // Keep AWS SDK external as it's provided by Lambda runtime
          'aws-sdk',
          '@aws-sdk/*',
          // Add @modelcontextprotocol/sdk as external to avoid bundling conflicts
          '@modelcontextprotocol/sdk',
        ],
        nodeModules: [
          // Explicitly include these modules in the bundle
          '@ai-sdk/amazon-bedrock',
          '@modelcontextprotocol/sdk',
          'ai',
          'jsonwebtoken',
          'jwks-client',
        ],
        minify: true,
        sourceMap: false,
        target: 'es2022',
        format: nodejs.OutputFormat.CJS,
      },
    });

    // Grant Bedrock permissions to Lambda
    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:ListFoundationModels',
        ],
        resources: ['*'],
      })
    );

    // Grant Cognito permissions to Lambda if Cognito is enabled
    if (this.userPool && this.identityPool) {
      apiLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'cognito-idp:GetUser',
            'cognito-idp:AdminGetUser',
            'cognito-identity:GetCredentialsForIdentity',
            'cognito-identity:GetId',
          ],
          resources: [
            this.userPool.userPoolArn,
            `arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/${this.identityPool.ref}`,
          ],
        })
      );
    }

    // API Gateway for the backend
    const api = new apigateway.RestApi(this, 'ApiGateway', {
      restApiName: `mcp-playground-api-${uniqueSuffix}`,
      description: 'API Gateway for MCP Playground backend',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
          'x-custom-auth-header',
        ],
      },
    });

    // Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(apiLambda, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    // API routes
    const apiResource = api.root.addResource('api');
    
    // Inference endpoint
    const inferenceResource = apiResource.addResource('inference');
    inferenceResource.addMethod('POST', lambdaIntegration);

    // MCP Proxy endpoint with proxy+ to catch all sub-paths
    const mcpProxyResource = apiResource.addResource('mcp-proxy');
    const mcpProxyAnyResource = mcpProxyResource.addResource('{proxy+}');
    mcpProxyAnyResource.addMethod('ANY', lambdaIntegration);

    // Auth endpoints (if Cognito is enabled)
    if (this.userPool && this.userPoolClient) {
      const authResource = apiResource.addResource('auth');
      
      // User info endpoint
      const userResource = authResource.addResource('user');
      userResource.addMethod('GET', lambdaIntegration);
      
      // Token validation endpoint
      const validateResource = authResource.addResource('validate');
      validateResource.addMethod('POST', lambdaIntegration);

      // Configuration endpoint for frontend
      const configResource = authResource.addResource('config');
      configResource.addMethod('GET', lambdaIntegration);
    }

    // Health check endpoint
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration);

    // Certificate handling
    let certificate: acm.ICertificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (props?.certificateArn) {
      // Use existing certificate
      certificate = acm.Certificate.fromCertificateArn(
        this,
        'ExistingCertificate',
        props.certificateArn
      );
    } else if (props?.domainName) {
      // Create new certificate
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: props.domainName,
        validation: acm.CertificateValidation.fromDns(),
      });
    }

    if (props?.hostedZoneId && props?.zoneName) {
      hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.zoneName,
      });
    }

    // Create CloudFront distribution using the same pattern as serverless-patterns
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'webDistribution', {
      originConfigs: [
        {
          customOriginSource: {
            domainName: `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            originPath: `/${api.deploymentStage.stageName}`,
          },
          behaviors: [
            {
              allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
              pathPattern: 'api/*',
              maxTtl: cdk.Duration.millis(0),
              defaultTtl: cdk.Duration.millis(0),
              minTtl: cdk.Duration.millis(0),
            },
            {
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
              pathPattern: 'health',
              maxTtl: cdk.Duration.millis(0),
              defaultTtl: cdk.Duration.millis(0),
              minTtl: cdk.Duration.millis(0),
            },
          ],
        },
        {
          s3OriginSource: {
            s3BucketSource: websiteBucket,
            originAccessIdentity: cfOriginAccessIdentity,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
            },
          ],
        },
      ],
      errorConfigurations: [
        {
          errorCode: 404,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
      ],
      ...(props?.domainName && certificate ? {
        viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
          aliases: [props.domainName],
        }),
      } : {}),
    });

    // Route53 record (only if hosted zone is provided and not using external DNS)
    if (hostedZone && props?.domainName && !props?.externalDns) {
      new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(distribution)
        ),
      });
    }

    // Deploy the built React app to S3
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../dist'))],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: props?.domainName 
        ? `https://${props.domainName}` 
        : `https://${distribution.distributionDomainName}`,
      description: 'Website URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 Bucket Name',
    });

    if (certificate) {
      new cdk.CfnOutput(this, 'CertificateArn', {
        value: certificate.certificateArn,
        description: 'SSL Certificate ARN',
      });
    }

    // Cognito outputs
    if (this.userPool && this.userPoolClient && this.identityPool) {
      new cdk.CfnOutput(this, 'UserPoolId', {
        value: this.userPool.userPoolId,
        description: 'Cognito User Pool ID',
      });

      new cdk.CfnOutput(this, 'UserPoolClientId', {
        value: this.userPoolClient.userPoolClientId,
        description: 'Cognito User Pool Client ID',
      });

      new cdk.CfnOutput(this, 'IdentityPoolId', {
        value: this.identityPool.ref,
        description: 'Cognito Identity Pool ID',
      });

      new cdk.CfnOutput(this, 'CognitoRegion', {
        value: this.region,
        description: 'AWS Region for Cognito',
      });
    }
  }
}
