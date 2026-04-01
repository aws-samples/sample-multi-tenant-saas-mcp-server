import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listTenantResources } from "../services/s3.js";
import { getS3File } from "./dynamicS3.js";

export function registerResources(mcpServer) {
  mcpServer.resource(
    "tenant-files",
    new ResourceTemplate("s3://{tenantId}/{filename}", {
      list: async (extra) => {
        const tenantId = extra.authInfo.extra.tenantId;
        const files = await listTenantResources(tenantId);

        return {
          resources: files.map(f => ({
            uri: `s3://${tenantId}/${f.filename}`,
            name: f.filename,
            mimeType: f.contentType,
            description: `Tenant file: ${f.filename}`
          }))
        };
      }
    }),
    {
      name: "Tenant S3 Files",
      description: "Access tenant-specific files from S3"
    },
    async (uri, variables, extra) => {
      const actualTenantId = extra.authInfo.extra.tenantId;
      const providedTenantId = variables.tenantId;
      const filename = variables.filename;

      if (actualTenantId !== providedTenantId) {
        throw new Error("Access denied: cannot access other tenant's files");
      }

      return await getS3File(filename, actualTenantId);
    }
  );
}
