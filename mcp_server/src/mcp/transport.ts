import log4js from "../utils/logging.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import mcpServer from "./mcp-server.js";
import mcpErrors from "./mcp-errors.js";

const l = log4js.getLogger("Transport");

export const postRequestHandler = async (req, res) => {
  try {

    // Create new instances of MCP Server and Transport for each incoming request
    const bookingMcpServer = mcpServer.create();
    const transport = new StreamableHTTPServerTransport({
      // This is a stateless MCP server, so we don't need to keep track of sessions
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      transport.close();
      bookingMcpServer.close();
    });
    
    await bookingMcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json(mcpErrors.internalServerError);
    }
  }
};

export const sessionRequestHandler = async (req, res) => {
  l.debug("-- Returning 405 not allowed --")
  res.status(405).set("Allow", "POST").json(mcpErrors.methodNotAllowed);
};