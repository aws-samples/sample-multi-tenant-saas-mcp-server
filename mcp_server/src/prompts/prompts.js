import { z } from "zod";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Container-safe synchronous file loading with multiple path strategies
function loadTemplatesFromJson() {
  const possiblePaths = [
    path.join(__dirname, 'prompts', 'templates.json'),
    path.join(process.cwd(), 'prompts', 'templates.json'),
    path.join(__dirname, '..', 'prompts', 'templates.json'),
    '/app/prompts/templates.json', // Container absolute path
    'prompts/templates.json' // Relative from working directory
  ];
  
  for (const templatesPath of possiblePaths) {
    try {
      if (fs.existsSync(templatesPath)) {
        const templatesData = fs.readFileSync(templatesPath, 'utf8');
        const parsed = JSON.parse(templatesData);
        return parsed.prompts;
      }
    } catch (error) {
      // Continue trying next path
      continue;
    }
  }
  
  console.error('Failed to load templates.json from any expected location');
  console.error('Attempted paths:', possiblePaths);
  throw new Error('templates.json not found in any expected location');
}

// Convert argument array to Zod schema
function convertArgumentsToZodSchema(argumentsArray) {
  if (!argumentsArray || argumentsArray.length === 0) {
    return undefined;
  }
  
  const schemaObject = {};
  
  argumentsArray.forEach(arg => {
    if (arg.required) {
      schemaObject[arg.name] = z.string().describe(arg.description);
    } else {
      schemaObject[arg.name] = z.optional(z.string()).describe(arg.description);
    }
  });
  
  return schemaObject;
}

// Load and convert prompt templates with error handling
function loadPromptTemplates() {
  try {
    const jsonTemplates = loadTemplatesFromJson();
    const convertedTemplates = {};
    
    Object.keys(jsonTemplates).forEach(key => {
      const template = jsonTemplates[key];
      convertedTemplates[key] = {
        name: template.name,
        description: template.description,
        arguments: convertArgumentsToZodSchema(template.arguments),
        template: template.template
      };
    });
    
    return convertedTemplates;
  } catch (error) {
    console.error('Error loading prompt templates:', error.message);
    // Return empty templates for graceful degradation
    return {};
  }
}

// Initialize prompt templates synchronously at module level (like original)
const promptTemplates = loadPromptTemplates();

function processPromptTemplate(template, args = {}) {
  // Handle special cases
  const processedArgs = { ...args };
  
  // Add default for preferences
  if (template.name === 'flight_search' && !processedArgs.preferences) {
    processedArgs.preferences = 'any flight is fine';
  }
  
  // Add default for guests
  if ((template.name === 'hotel_search' || template.name === 'book_hotel_demo') && !processedArgs.guests) {
    processedArgs.guests = '1';
  }
  
  // Add budget text for policy_compliant_booking
  if (template.name === 'policy_compliant_booking') {
    processedArgs.budget_text = processedArgs.budget 
      ? `Your specified budget is ${processedArgs.budget}. ` 
      : '';
  }
  
  // Replace template variables
  return template.template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return processedArgs[key] || '';
  });
}

export function registerPromptHandlers(mcpServer) {
  // Check if the server has a prompt method
  if (typeof mcpServer.prompt === 'function') {
    // Register each prompt
    Object.values(promptTemplates).forEach(promptDef => {
      mcpServer.prompt(
        promptDef.name,
        promptDef.description,
        promptDef.arguments,
        async (args) => {
          const processedText = processPromptTemplate(promptDef, args);
          return {
            messages: [{
              role: "user",
              content: {
                type: "text",
                text: processedText
              }
            }]
          };
        }
      );
    });
  } else {
    console.error("MCP Server doesn't support prompt registration with .prompt() method");
    
    // Alternative: Try registering as a tool that returns prompt text
    mcpServer.tool(
      "get_prompt",
      "Get a prompt template for various workflows",
      {
        name: z.enum([
          'flight_search', 
          'booking_flow', 
          'loyalty_overview', 
          'policy_compliant_booking',
          'hotel_search',
          'book_flight_demo',
          'book_hotel_demo'
        ]),
        arguments: z.optional(z.record(z.string()))
      },
      async ({ name, arguments: args }) => {
        const promptDef = promptTemplates[name];
        if (!promptDef) {
          return { error: `Unknown prompt: ${name}` };
        }
        
        const processedText = processPromptTemplate(promptDef, args);
        return {
          content: [{
            type: "text",
            text: processedText
          }]
        };
      }
    );
    
    mcpServer.tool(
      "list_prompts",
      "List all available prompt templates",
      {},
      async () => {
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              Object.values(promptTemplates).map(p => ({
                name: p.name,
                description: p.description,
                arguments: p.arguments
              })),
              null,
              2
            )
          }]
        };
      }
    );
  }
}