import { bedrock } from "@ai-sdk/amazon-bedrock";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, streamText, type UIMessage } from "ai";

export type InferenceParams = {
  model: string;
  messages: UIMessage[];
  system_message: string;
  max_tokens: number;
  tools: Tool[];
  resources: any[];
  prompts: any[];
};

export async function createInferenceHandler(params: InferenceParams) {
  const { model, messages, system_message, max_tokens, tools, resources, prompts } = params;

  // Convert MCP tools to AI SDK format
  const mcpTools = Object.fromEntries(
    tools.map((t) => {
      return [
        t.name,
        {
          description: t.description,
          parameters: t.inputSchema ? jsonSchema(t.inputSchema as any) : { type: "object" },
        },
      ];
    })
  );

  // Add readResource tool if resources are available
  if (resources.length > 0) {
    mcpTools.readResource = {
      description: `Read content from available MCP resources. Available resources: ${resources.map(r => `${r.name} (${r.uri})`).join(', ')}`,
      parameters: jsonSchema({
        type: "object",
        properties: {
          uri: {
            type: "string",
            description: "URI of the resource to read"
          }
        },
        required: ["uri"]
      }),
    };
  }

  // Add getPrompt tool if prompts are available
  if (prompts.length > 0) {
    mcpTools.getPrompt = {
      description: `Get and execute MCP prompts. Available prompts: ${prompts.map(p => `${p.name} - ${p.description}`).join(', ')}`,
      parameters: jsonSchema({
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the prompt to get"
          },
          arguments: {
            type: "object",
            description: "Arguments for the prompt"
          }
        },
        required: ["name"]
      }),
    };
  }

  // Create the streamText result
  return streamText({
    model: bedrock(model),
    messages,
    system: system_message,
    maxTokens: max_tokens,
    tools: mcpTools,
    toolCallStreaming: false,
    onError: (err) => {
      console.error("Bedrock error:", err);
    },
  });
}
