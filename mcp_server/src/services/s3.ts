import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

export const BUCKET_NAME = process.env.BUCKET_NAME;

export async function getS3Client(tenantId: string) {
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
      const s3Client = new S3Client({
        credentials: {
          accessKeyId: response.Credentials.AccessKeyId!,
          secretAccessKey: response.Credentials.SecretAccessKey!,
          sessionToken: response.Credentials.SessionToken,
        },
        region: process.env.AWS_DEFAULT_REGION || "us-east-1",
      });

      return s3Client;
    } else {
      throw new Error("Failed to obtain temporary credentials");
    }
  } catch (error) {
    console.error("Error assuming role:", error);
    throw error;
  }
}

/**
 * Discover all S3 resources for a specific tenant
 * @param tenantId - The tenant identifier
 * @returns Array of tenant's S3 resources with metadata
 */
export async function listTenantResources(tenantId: string): Promise<{
  key: string;
  filename: string;
  contentType: string;
}[]> {
  try {
    const s3Client = await getS3Client(tenantId);

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `${tenantId}/`,
      MaxKeys: 100 // Reasonable limit for demo purposes
    });

    const response = await s3Client.send(command);

    if (!response.Contents) {
      console.log(`No resources found for tenant: ${tenantId}`);
      return [];
    }

    return response.Contents
      .filter(obj => obj.Key && obj.Key !== `${tenantId}/`) // Exclude directory prefix
      .map(obj => {
        const key = obj.Key!;
        const filename = key.substring(tenantId.length + 1); // Remove "tenantId/" prefix

        // Determine content type based on file extension
        let contentType = 'text/plain';
        if (filename.endsWith('.json')) {
          contentType = 'application/json';
        } else if (filename.endsWith('.md')) {
          contentType = 'text/markdown';
        } else if (filename.endsWith('.txt')) {
          contentType = 'text/plain';
        }

        return {
          key,
          filename,
          contentType
        };
      });

  } catch (error) {
    console.error(`Error listing resources for tenant ${tenantId}:`, error);
    throw new Error(`Failed to list tenant resources: ${error}`);
  }
}
