import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { getS3Client, BUCKET_NAME } from "../services/s3.js";

/**
 * Generic S3 file reader for dynamically discovered tenant resources
 * @param filename - Name of the file to read (without tenant prefix)
 * @param tenantId - Tenant Identifier
 * @returns Resource content with appropriate MIME type
 */
export async function getS3File(
  filename: string,
  tenantId: string
) {
  try {
    const s3Client = await getS3Client(tenantId);
    const key = `${tenantId}/${filename}`;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    // Convert readable stream to string
    const stream = response.Body;
    if (stream instanceof Readable) {
      const chunks = [] as any[];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const content = Buffer.concat(chunks).toString("utf-8");

      // Determine MIME type based on file extension
      let mimeType = 'text/plain';
      if (filename.endsWith('.json')) {
        mimeType = 'application/json';
      } else if (filename.endsWith('.md')) {
        mimeType = 'text/markdown';
      } else if (filename.endsWith('.txt')) {
        mimeType = 'text/plain';
      }

      // Create resource URI
      const uri = `s3://${tenantId}/${filename}`;

      return {
        contents: [
          {
            uri,
            mimeType,
            text: content,
          },
        ],
      };
    }

    throw new Error("Invalid response from S3");
  } catch (error) {
    console.error(`Error reading S3 file ${filename} for tenant ${tenantId}:`, error);
    throw new Error(`Failed to read S3 file: ${filename}`);
  }
}