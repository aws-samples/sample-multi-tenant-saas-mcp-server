import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { metadata } from "../utils/metadata.js";
import { registerTools } from "../tools/register.js";
import { registerResources } from "../resources/register.js";
import { registerPrompts } from "../prompts/register.js";

const create = () => {
  const mcpServer = new McpServer(
    {
      name: "TravelBookingMCPServer",
      title: "B2B Travel Booking Demo MCP Server",
      version: metadata.version,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {}
      },
    }
  );

  registerTools(mcpServer);
  registerResources(mcpServer);
  registerPrompts(mcpServer);

  return mcpServer;
};

export default { create };
