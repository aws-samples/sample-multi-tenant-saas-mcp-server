import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { authenticateToken, optionalAuth } from "./auth-middleware.js";
import { createInferenceHandler, type InferenceParams } from "../shared/inference-handler.js";
import { handleMcpProxy } from "../shared/mcp-proxy.js";
import { setCorsHeaders } from "../shared/cors-config.js";
import { createHealthCheckResponse } from "../shared/response-utils.js";
import { getAuthConfig } from "../shared/auth-handlers.js";

// Load environment variables
dotenv.config({ path: ['.env.local', '.env'] });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());

// Apply JSON parsing to all routes
app.use(express.json());

// Apply URL-encoded parsing only to non-proxy routes
app.use((req, res, next) => {
	if (!req.path.startsWith('/api/mcp-proxy')) {
		express.urlencoded({ extended: true })(req, res, next);
	} else {
		next();
	}
});

// Initialize AWS credentials from the default provider chain
let credentialsInitialized = false;

async function initializeCredentials() {
	if (credentialsInitialized) return;
	
	try {
		// Only set credentials if they're not already in environment variables
		if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
			const credentialProvider = fromNodeProviderChain();
			const credentials = await credentialProvider();
			
			// Set environment variables for the AI SDK to pick up
			process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
			process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
			if (credentials.sessionToken) {
				process.env.AWS_SESSION_TOKEN = credentials.sessionToken;
			}
			
			console.log("AWS credentials loaded from default provider chain");
		}
		credentialsInitialized = true;
	} catch (error) {
		console.error("Failed to initialize AWS credentials:", error);
		throw error;
	}
}

// Authentication endpoints
app.get("/api/auth/config", (req, res) => {
	const config = {
		userPoolId: process.env.COGNITO_USER_POOL_ID,
		clientId: process.env.COGNITO_CLIENT_ID,
		region: process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1',
	};

	if (!config.userPoolId || !config.clientId) {
		return res.status(500).json({ 
			error: "Authentication not configured",
			details: "Missing Cognito configuration"
		});
	}

	res.json(config);
});

app.get("/api/auth/user", authenticateToken, (req: any, res) => {
	res.json({
		user: req.user,
		authenticated: true
	});
});

app.post("/api/auth/validate", authenticateToken, (req: any, res) => {
	res.json({
		valid: true,
		user: req.user
	});
});

type PostInferenceBody = InferenceParams & {
	lora: string | null;
	stream: boolean;
};

app.post("/api/inference", optionalAuth, async (req: any, res) => {
	try {
		// Initialize credentials before making any Bedrock calls
		await initializeCredentials();

		const {
			model,
			messages,
			system_message,
			max_tokens,
			tools = [],
			resources = [],
			prompts = [],
		}: PostInferenceBody = req.body;

		// Use the model ID directly (no mapping needed for Bedrock models)
		const bedrockModelId = model;

		// Validate that we have a model ID
		if (!bedrockModelId) {
			return res.status(400).json({ error: "No model specified" });
		}

		console.log(`Starting inference with model: ${bedrockModelId}`);

		// Use shared inference handler
		const result = await createInferenceHandler({
			model: bedrockModelId,
			messages,
			system_message,
			max_tokens,
			tools,
			resources,
			prompts,
		});

		// Convert to DataStreamResponse and handle it properly
		const dataStreamResponse = result.toDataStreamResponse({
			getErrorMessage: (error: unknown) => {
				console.error("Stream error:", error);
				return "Error during inference";
			},
		});

		// Copy headers from the DataStreamResponse to Express response
		dataStreamResponse.headers.forEach((value, key) => {
			res.setHeader(key, value);
		});

		// Set status
		res.status(dataStreamResponse.status);

		// Stream the body
		if (dataStreamResponse.body) {
			const reader = dataStreamResponse.body.getReader();
			
			const pump = async () => {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							res.end();
							break;
						}
						res.write(value);
					}
				} catch (error) {
					console.error("Streaming error:", error);
					res.end();
				}
			};

			await pump();
		} else {
			res.end();
		}

	} catch (error) {
		console.error("API error:", error);
		res.status(500).json({ 
			error: "Internal server error",
			details: error instanceof Error ? error.message : "Unknown error"
		});
	}
});

// MCP Proxy endpoint with OAuth discovery support
app.all("/api/mcp-proxy/*", async (req, res) => {
	try {
		let requestBody = req.body;
		
		// For OAuth token exchange (form-encoded), we need to reconstruct the raw form data
		if (req.method !== 'GET' && req.headers['content-type'] === 'application/x-www-form-urlencoded') {
			// Convert parsed body back to form-encoded string
			if (typeof req.body === 'object' && req.body !== null) {
				const formParts: string[] = [];
				for (const [key, value] of Object.entries(req.body)) {
					formParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
				}
				requestBody = formParts.join('&');
			}
		}

		const proxyResponse = await handleMcpProxy({
			method: req.method,
			url: req.url,
			headers: req.headers,
			body: requestBody,
			queryStringParameters: req.query as Record<string, string>
		});

		// Set headers
		Object.entries(proxyResponse.headers).forEach(([key, value]) => {
			res.setHeader(key, value);
		});

		// Send response
		// Use send() instead of json() since proxyResponse.body is already a JSON string
		res.status(proxyResponse.statusCode).send(proxyResponse.body);
	} catch (error) {
		console.error("MCP Proxy error:", error);
		res.status(500).json({ 
			error: "Proxy error",
			details: error instanceof Error ? error.message : "Unknown error"
		});
	}
});

// Handle OPTIONS requests for CORS preflight
app.options("/api/mcp-proxy/*", (req, res) => {
	setCorsHeaders((key, value) => res.setHeader(key, value));
	res.status(200).end();
});

// Health check endpoint
app.get("/health", (req, res) => {
	res.json(createHealthCheckResponse());
});

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
	console.log("AWS credentials will be loaded from default provider chain:");
	console.log("1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)");
	console.log("2. ~/.aws/credentials file");
	console.log("3. ~/.aws/config file");
	console.log("4. IAM roles (if running on EC2)");
	console.log(`AWS Region: ${process.env.AWS_REGION || "us-east-1"}`);
});

export default app;
