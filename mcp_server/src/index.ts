import log4js from "./utils/logging.js";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import config from './utils/env-config.js';
import { metadata } from "./utils/metadata.js";
import {postRequestHandler, sessionRequestHandler} from "./mcp/transport.js";
import {tokenMiddleware} from "./auth/token-middleware.js";
import { handleMetadataRequest } from './auth/oauth-metadata.js';

const l = log4js.getLogger("Index");
const port = config.PORT || 3000;

const app = express();
app.use(express.json());

// CORS configuration
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Protocol-Version']
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: metadata.version
    });
});

// Request logging
app.use((req, res, next) => {
  l.debug(`> ${req.method} ${req.originalUrl}`);
  if(req.body) {
    l.debug(req.body);
  }
  next();
});

// OAuth 2.1 Protected Resource Metadata endpoint (RFC 9728)
app.get(/^\/\.well-known\/oauth-protected-resource.*/, handleMetadataRequest);

// MCP endpoints with OAuth token validation
const mcpLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.post("/mcp", mcpLimiter, tokenMiddleware, postRequestHandler);
app.get("/mcp", sessionRequestHandler);
app.delete("/mcp", sessionRequestHandler);

// Start server
app.listen(port, () => {
    l.info(`🌍 ═══ B2B MULTI-TENANT TRAVEL MCP v${metadata.version} on port ${port} ═══ Ready to Explore! ✈️`);
});
