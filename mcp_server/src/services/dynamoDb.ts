import { DynamoDB, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

export const TABLE_NAME = process.env.TABLE_NAME;

export async function getDynamoDbClient(tenantId: string) {
  const stsClient = new STSClient({
    region: process.env.AWS_DEFAULT_REGION || "us-east-1",
  });

  try {
    const command = new AssumeRoleCommand({
      RoleArn: process.env.ROLE_ARN,
      RoleSessionName: `tenant-${tenantId}-session`,
      Tags: [
        {
          Key: "tenantId",
          Value: tenantId,
        },
      ],
    });

    const response = await stsClient.send(command);

    if (response.Credentials) {
      const dynamoDbClient = new DynamoDBClient({
        credentials: {
          accessKeyId: response.Credentials.AccessKeyId!,
          secretAccessKey: response.Credentials.SecretAccessKey!,
          sessionToken: response.Credentials.SessionToken,
        },
        region: process.env.AWS_DEFAULT_REGION || "us-east-1",
      });

      return dynamoDbClient;
    } else {
      throw new Error("Failed to obtain temporary credentials");
    }
  } catch (error) {
    console.error("Error assuming role:", error);
    throw error;
  }
}
