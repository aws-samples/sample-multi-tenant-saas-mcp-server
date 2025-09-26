import { useChat } from "@ai-sdk/react";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FinetuneSelector from "./FinetuneSelector";
import Footer from "./Footer";
import Header from "./Header";
import { SparkleIcon } from "./Icons";
import McpServers from "./McpServers";
import ModelSelector from "./ModelSelector";
import { models } from "./models";
import ViewCodeModal from "./ViewCodeModal";

export type Params = {
	model: string;
	max_tokens: number;
	stream: boolean;
	lora: string | null;
};

const finetuneTemplates = {
	"cf-public-cnn-summarization": `You are given a news article below. Please summarize the article, including only its highlights.

### Article: 

### Summary:`,
	"cf-public-jigsaw-classification": `You are a helpful, precise, detailed, and concise artificial intelligence assistant. You are a very intelligent and sensitive, having a keen ability to discern whether or not a text message is toxic. You can also be trusted with following the instructions given to you precisely, without deviations.
In this task, you are asked to decide whether or not comment text is toxic.
Toxic content harbors negativity towards a person or a group, for instance:
  - stereotyping (especially using negative stereotypes)
  - disparaging a person's gender -- as in "male", "female", "men", "women"
  - derogatory language or slurs
  - racism -- as in discriminating toward people who are "black", "white"
  - cultural appropriation
  - mockery or ridicule
  - sexual objectification
  - homophobia -- bullying people who are "homosexual", "gay", "lesbian"
  - historical insensitivity
  - disrespecting religion -- as in "christian", "jewish", "muslim"
  - saying that certain groups are less worthy of respect
  - insensitivity to health conditions -- as in "psychiatric/mental illness"

Read the comment text provided and predict whether or not the comment text is toxic. If comment text is toxic according to the instructions, then the answer is "yes" (return "yes"); otherwise, the answer is "no" (return "no").
Output the answer only as a "yes" or a "no"; do not provide explanations.
Please, never return empty output; always return a "yes" or a "no" answer.
You will be evaluated based on the following criteria: - The generated answer is always "yes" or "no" (never the empty string, ""). - The generated answer is correct for the comment text presented to you.
### Comment Text: 
### Comment Text Is Toxic (Yes/No):`,
	"cf-public-openorca": `You are an AI assistant that provides accurate, helpful, and harmless responses. You should be honest about what you know and don't know, and provide clear explanations when possible.

User: `,
};

export default function MainApp() {
	const queryParams = new URLSearchParams(document.location.search);
	const selectedModelParam = queryParams.get("model");
	const selectedFinetuneParam = queryParams.get("finetune");

	const defaultModel = "us.amazon.nova-lite-v1:0";
	const [params, setParams] = useState<Params>(() => {
		// Try to get stored model from sessionStorage
		const storedModel = sessionStorage.getItem("selectedModel");
		const modelToUse = selectedModelParam || storedModel || defaultModel;
		
		// Store the selected model immediately
		sessionStorage.setItem("selectedModel", modelToUse);

		return {
			lora: selectedFinetuneParam || null,
			max_tokens: 512,
			model: modelToUse,
			stream: true,
		};
	});

	const [error, setError] = useState("");
	const [codeVisible, setCodeVisible] = useState(false);
	const [settingsVisible, setSettingsVisible] = useState(false);
	const [debugVisible, setDebugVisible] = useState(false);
	const [showThinkingTokens, setShowThinkingTokens] = useState(false);
	const [systemMessage, setSystemMessage] = useState("You are a helpful assistant");
	const [mcpTools, setMcpTools] = useState<Tool[]>([]);
	const mcpToolsRef = useRef<Tool[]>([]);
	const [mcpResources, setMcpResources] = useState<any[]>([]);
	const mcpResourcesRef = useRef<any[]>([]);
	const [mcpPrompts, setMcpPrompts] = useState<any[]>([]);
	const mcpPromptsRef = useRef<any[]>([]);
	const [debugLogs, setDebugLogs] = useState<Array<{timestamp: string, level: string, message: string}>>([]);

	// Stable callback for updating MCP tools to prevent infinite loops
	const handleToolsUpdate = useCallback((tools: Tool[]) => {
		setMcpTools(tools);
	}, []);

	// Stable callback for updating MCP resources
	const handleResourcesUpdate = useCallback((resources: any[]) => {
		setMcpResources(resources);
	}, []);

	// Parse @prompt_name syntax from user input
	const parsePromptCommand = useCallback((input: string) => {
		const trimmed = input.trim();
		if (!trimmed.startsWith('@')) return null;
		
		const parts = trimmed.slice(1).split(/\s+/);
		const promptName = parts[0];
		const args = parts.slice(1);
		
		return { promptName, args };
	}, []);

	// Execute prompt command
	const executePromptCommand = useCallback(async (promptName: string, args: string[]) => {
		const prompt = mcpPromptsRef.current.find(p => p.name === promptName);
		if (!prompt) {
			throw new Error(`Prompt "${promptName}" not found. Available prompts: ${mcpPromptsRef.current.map(p => p.name).join(', ')}`);
		}

		// Get argument names from prompt schema
		let argNames: string[] = [];
		let requiredArgs: string[] = [];
		
		if (prompt.arguments?.properties) {
			argNames = Object.keys(prompt.arguments.properties);
			requiredArgs = prompt.arguments.required || argNames;
		} else if (prompt.arguments?.type === 'object' && prompt.arguments?.properties) {
			argNames = Object.keys(prompt.arguments.properties);
			requiredArgs = prompt.arguments.required || argNames;
		} else if (Array.isArray(prompt.arguments)) {
			// Handle array-based arguments
			argNames = prompt.arguments.map((arg: any, index: number) => arg.name || `arg${index}`);
			requiredArgs = argNames;
		} else {
			// Fallback: assume no arguments needed
			argNames = [];
			requiredArgs = [];
		}

		// Check if we have enough arguments before trying to execute
		if (args.length < requiredArgs.length) {
			throw new Error(`Missing required arguments for prompt "${promptName}": ${requiredArgs.slice(args.length).join(', ')}. Usage: @${promptName} ${argNames.map(arg => `<${arg}>`).join(' ')}`);
		}

		// Convert args array to arguments object
		const promptArgs: any = {};
		argNames.forEach((argName, index) => {
			if (args[index] !== undefined) {
				promptArgs[argName] = args[index];
			}
		});

		if (prompt.getPrompt) {
			try {
				const result = await prompt.getPrompt(promptArgs);
				return result.messages?.map((m: any) => m.content?.text || JSON.stringify(m.content)).join('\n') || JSON.stringify(result);
			} catch (error) {
				// Convert MCP errors to user-friendly messages
				if (error instanceof Error && error.message.includes('Invalid arguments')) {
					throw new Error(`Invalid arguments for prompt "${promptName}". Usage: @${promptName} ${argNames.map(arg => `<${arg}>`).join(' ')}`);
				}
				throw error;
			}
		}
		
		throw new Error(`Prompt "${promptName}" is not executable`);
	}, []);

	// Stable callback for updating MCP prompts
	const handlePromptsUpdate = useCallback((prompts: any[]) => {
		setMcpPrompts(prompts);
	}, []);

	// Update ref when mcpTools changes
	useEffect(() => {
		mcpToolsRef.current = mcpTools;
	}, [mcpTools]);

	// Update ref when mcpResources changes
	useEffect(() => {
		mcpResourcesRef.current = mcpResources;
	}, [mcpResources]);

	// Update ref when mcpPrompts changes
	useEffect(() => {
		mcpPromptsRef.current = mcpPrompts;
	}, [mcpPrompts]);

	// Memoize the onToolCall handler to prevent useChat from recreating
	const onToolCall = useCallback(async ({ toolCall }: { toolCall: any }) => {
		try {
			// Debug: see what's actually in toolCall
			console.log("TOOLCALL OBJECT:", JSON.stringify(toolCall, null, 2));
			
			// Handle readResource tool call
			if (toolCall.toolName === 'readResource') {
				const { uri } = toolCall.args as { uri: string };
				const resource = mcpResourcesRef.current.find(r => r.uri === uri);
				if (resource && resource.readResource) {
					const result = await resource.readResource();
					return result.contents?.[0]?.text || JSON.stringify(result);
				}
				throw new Error(`Resource not found: ${uri}`);
			}

			// Handle getPrompt tool call
			if (toolCall.toolName === 'getPrompt') {
				const { name, arguments: args } = toolCall.args as { name: string; arguments?: any };
				const prompt = mcpPromptsRef.current.find(p => p.name === name);
				if (prompt && prompt.getPrompt) {
					const result = await prompt.getPrompt(args || {});
					return result.messages?.map((m: any) => m.content?.text || JSON.stringify(m.content)).join('\n') || JSON.stringify(result);
				}
				throw new Error(`Prompt not found: ${name}`);
			}
			
			const mcpTool = mcpToolsRef.current.find((t) => t.name === toolCall.toolName);
			if (mcpTool) {
				const { args } = toolCall as { args: Record<string, any> };
				// convert any args from string to number if their schema says they should be
				const convertedArgs = Object.fromEntries(
					Object.entries(args).map(([key, value]) => {
						if (
							(mcpTool.inputSchema.properties?.[key] as any)?.type === "number" &&
							typeof value === "string"
						) {
							return [key, Number(value)];
						}
						return [key, value];
					}),
				);
				const calledTool = await (mcpTool as any).callTool(convertedArgs);
				if (Array.isArray(calledTool?.content)) {
					return (
						calledTool.content
							// @ts-expect-error need to fix this
							.map((c) => {
								if (c.type === "image") {
									// Extract the base64 data and mime type
									const { data, mimeType } = c;
									const binaryData = atob(data);

									// Create an array buffer from the binary data
									const arrayBuffer = new Uint8Array(binaryData.length);
									for (let i = 0; i < binaryData.length; i++) {
										arrayBuffer[i] = binaryData.charCodeAt(i);
									}

									// Create a blob from the array buffer
									const blob = new Blob([arrayBuffer], { type: mimeType });

									// Create an object URL for the blob
									const imageUrl = URL.createObjectURL(blob);

									return {
										type: "image",
										image: imageUrl,
									};
								}
								return c;
							})
							.filter((c: any) => c.type === "text")
							.map((c: any) => c.text)
							.join("\n") || "Tool executed successfully"
					);
				}
				return calledTool?.content?.[0]?.text || "Tool executed successfully";
			}
			return `Tool ${toolCall.toolName} not found`;
		} catch (error) {
			console.error("Tool call error:", error);
			return `Error calling tool: ${error}`;
		}
	}, []);

	// Add debug logging function
	const addDebugLog = useCallback((level: string, message: string) => {
		const timestamp = new Date().toLocaleTimeString();
		setDebugLogs(prev => [...prev.slice(-99), { timestamp, level, message }]); // Keep last 100 logs
	}, []);

	// Function to filter thinking tokens from message content
	const filterThinkingTokens = useCallback((content: string) => {
		if (showThinkingTokens) {
			return content;
		}
		// Remove content between <thinking> and </thinking> tags
		return content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
	}, [showThinkingTokens]);

	// Override console methods to capture logs
	useEffect(() => {
		const originalLog = console.log;
		const originalError = console.error;
		const originalWarn = console.warn;

		console.log = (...args) => {
			originalLog(...args);
			addDebugLog('info', args.join(' '));
		};

		console.error = (...args) => {
			originalError(...args);
			addDebugLog('error', args.join(' '));
		};

		console.warn = (...args) => {
			originalWarn(...args);
			addDebugLog('warn', args.join(' '));
		};

		return () => {
			console.log = originalLog;
			console.error = originalError;
			console.warn = originalWarn;
		};
	}, [addDebugLog]);

	// Memoize the useChat configuration to prevent infinite loops
	const chatConfig = useMemo(() => ({
		api: "/api/inference",
		body: {
			lora: params.lora,
			max_tokens: params.max_tokens,
			model: params.model,
			stream: params.stream,
			system_message: systemMessage,
			tools: mcpTools,
			resources: mcpResources,
			prompts: mcpPrompts,
		},
		maxSteps: 5,
		onToolCall,
	}), [params.lora, params.max_tokens, params.model, params.stream, systemMessage, mcpTools, mcpResources, mcpPrompts, onToolCall]);

	const { messages, input, handleInputChange, handleSubmit: originalHandleSubmit, status, setMessages } = useChat(chatConfig);

	// Custom handleSubmit to intercept @prompt commands
	const handleSubmit = useCallback(async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		
		const promptCommand = parsePromptCommand(input);
		if (promptCommand) {
			try {
				const result = await executePromptCommand(promptCommand.promptName, promptCommand.args);
				// Add the prompt result as a system message
				setMessages(prev => [
					...prev,
					{ id: Date.now().toString(), role: 'user', content: input },
					{ id: (Date.now() + 1).toString(), role: 'assistant', content: result }
				]);
				// Clear input after successful prompt execution
				handleInputChange({ target: { value: '' } } as any);
			} catch (error) {
				// Add error message
				setMessages(prev => [
					...prev,
					{ id: Date.now().toString(), role: 'user', content: input },
					{ id: (Date.now() + 1).toString(), role: 'assistant', content: `Error: ${error instanceof Error ? error.message : String(error)}` }
				]);
				// Clear input even after error
				handleInputChange({ target: { value: '' } } as any);
			}
			return;
		}
		
		// Normal chat submission
		originalHandleSubmit(e);
	}, [input, parsePromptCommand, executePromptCommand, setMessages, originalHandleSubmit, handleInputChange]);

	const [showPromptSuggestions, setShowPromptSuggestions] = useState(false);
	const [promptSuggestions, setPromptSuggestions] = useState<any[]>([]);

	// Handle input change to show prompt suggestions
	const handleInputChangeWithSuggestions = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
		handleInputChange(e);
		
		const value = e.target.value;
		const cursorPos = e.target.selectionStart;
		const textBeforeCursor = value.slice(0, cursorPos);
		
		// Check if we're typing a prompt command
		const match = textBeforeCursor.match(/@(\w*)$/);
		if (match) {
			const partial = match[1].toLowerCase();
			const filtered = mcpPrompts.filter(p => 
				p.name.toLowerCase().startsWith(partial)
			);
			setPromptSuggestions(filtered);
			setShowPromptSuggestions(filtered.length > 0);
		} else {
			setShowPromptSuggestions(false);
		}
	}, [handleInputChange, mcpPrompts]);

	const loading = status === "submitted";
	const streaming = status === "streaming";

	const messageElement = useRef<HTMLDivElement>(null);

	useHotkeys("meta+enter, ctrl+enter", () => handleSubmit(), {
		enableOnFormTags: ["textarea"],
	});

	const activeModel = models.find((model) => model.name === params.model);

	return (
		<main className="w-full h-full bg-gray-50 md:px-6">
			<ViewCodeModal
				params={params}
				messages={messages}
				visible={codeVisible}
				handleHide={(e) => {
					e.stopPropagation();
					setCodeVisible(false);
				}}
			/>

			<div className="h-full max-w-[1400px] mx-auto items-start md:pb-[168px]">
				<Header onSetCodeVisible={setCodeVisible} />

				<div className="flex h-full md:pb-8 items-start md:flex-row flex-col">
					<div className="md:w-1/3 w-full h-full md:overflow-auto bg-white md:rounded-md shadow-md md:block z-10">
						<div className="bg-ai h-[3px]" />
						<section className="rounded-lg bg-white p-4">
							<div className="flex align-middle">
								<span className="text-lg font-semibold">
									Amazon Bedrock MCP Playground
								</span>

								<button
									type="button"
									className="ml-auto rounded-md border border-gray-200 px-2 py-1 -mt-1 md:hidden"
									onClick={() => setSettingsVisible(!settingsVisible)}
								>
									<svg
										width="22"
										height="22"
										viewBox="0 0 22 22"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<title>Settings</title>
										<path
											d="M11.0001 7.5625C10.3202 7.5625 9.65558 7.76411 9.09029 8.14182C8.52499 8.51954 8.0844 9.05641 7.82422 9.68453C7.56405 10.3126 7.49597 11.0038 7.62861 11.6706C7.76125 12.3374 8.08864 12.9499 8.56938 13.4307C9.05012 13.9114 9.66263 14.2388 10.3294 14.3714C10.9962 14.5041 11.6874 14.436 12.3155 14.1758C12.9437 13.9157 13.4805 13.4751 13.8582 12.9098C14.236 12.3445 14.4376 11.6799 14.4376 11C14.4376 10.0883 14.0754 9.21398 13.4307 8.56932C12.7861 7.92466 11.9117 7.5625 11.0001 7.5625ZM11.0001 13.0625C10.5921 13.0625 10.1934 12.9415 9.8542 12.7149C9.51502 12.4883 9.25066 12.1662 9.09456 11.7893C8.93845 11.4124 8.89761 10.9977 8.97719 10.5976C9.05677 10.1975 9.2532 9.83004 9.54165 9.54159C9.8301 9.25315 10.1976 9.05671 10.5977 8.97713C10.9978 8.89755 11.4125 8.93839 11.7893 9.0945C12.1662 9.2506 12.4883 9.51496 12.715 9.85414C12.9416 10.1933 13.0626 10.5921 13.0626 11C13.0626 11.547 12.8453 12.0716 12.4585 12.4584C12.0717 12.8452 11.5471 13.0625 11.0001 13.0625Z"
											fill="#797979"
										/>
										<path
											d="M17.1532 11L19.7107 8.52844L17.4832 4.67156L14.1351 5.63062L13.2379 2.0625H8.76912L7.90631 5.63062L4.53756 4.67156L2.31006 8.53187L4.88131 11.0172L2.31006 13.5059L4.53756 17.3628L7.90631 16.4003L8.78287 19.9375H13.2516L14.1351 16.4106L17.5244 17.38L19.7554 13.5231L17.1532 11ZM16.8438 15.7472L13.8429 14.8844L12.9216 15.5203L12.1654 18.5625H9.85537L9.09912 15.5375L8.20881 14.8844L5.19068 15.7472L4.03568 13.75L6.28381 11.5775V10.4637L4.03568 8.28781L5.19068 6.28719L8.21225 7.15344L9.10256 6.44187L9.85537 3.4375H12.1654L12.9216 6.45563L13.8085 7.16719L16.8438 6.28719L17.9988 8.28781L15.7472 10.4637L15.7816 11.5741L18.0126 13.75L16.8438 15.7472Z"
											fill="#797979"
										/>
									</svg>
								</button>
							</div>

							<p className="text-gray-400 text-sm mt-1 mb-4">
								Explore different Text Generation models by drafting messages and
								fine-tuning your responses.
							</p>

							<div className="md:mb-4">
								<ModelSelector
									models={models}
									model={activeModel}
									onModelSelection={(model) => {
										const modelName = model ? model.name : defaultModel;
										// Store selected model in sessionStorage
										sessionStorage.setItem("selectedModel", modelName);
										setParams({
											...params,
											lora: null,
											model: modelName,
										});
									}}
								/>
							</div>

							{activeModel?.finetunes && (
								<div className="md:mb-4">
									<FinetuneSelector
										models={[null, ...activeModel.finetunes]}
										model={params.lora}
										onSelection={(model) => {
											setParams({
												...params,
												lora: model ? model.name : null,
											});
											setMessages([
												{
													content:
														finetuneTemplates[
															model?.name as keyof typeof finetuneTemplates
														] || "",
													id: "0",
													role: "user",
												},
											]);
										}}
									/>
								</div>
							)}

							<div
								className={`mt-4 md:block ${settingsVisible ? "block" : "hidden"}`}
							>
								{/* biome-ignore lint/a11y/noLabelWithoutControl: eh */}
								<label className="font-semibold text-sm block mb-1">
									System Message
								</label>
								<TextareaAutosize
									className="w-full p-2 border border-gray-200 rounded-md resize-none hover:bg-gray-50 overflow-y-auto"
									minRows={2}
									maxRows={2}
									value={systemMessage}
									onChange={(e) => setSystemMessage(e.target.value)}
								/>
							</div>
							<div
								className={`mt-4 md:block ${settingsVisible ? "block" : "hidden"}`}
							>
								{/* biome-ignore lint/a11y/noLabelWithoutControl: eh */}
								<label className="font-semibold text-sm block mb-1">
									Maximum Output Length (Tokens)
								</label>
								<div className="flex items-center p-2 border border-gray-200 rounded-md ">
									<input
										className="w-full appearance-none cursor-pointer bg-ai rounded-full h-2 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_#FF9900]"
										type="range"
										min={1}
										max={2048}
										value={params.max_tokens}
										onChange={(e) =>
											setParams({
												...params,
												max_tokens: Number.parseInt(e.target.value, 10),
											})
										}
									/>
									<span className="ml-3 text-md text-gray-800 w-12 text-right">
										{params.max_tokens}
									</span>
								</div>
							</div>

							<div
								className={`mt-4 md:block ${settingsVisible ? "block" : "hidden"}`}
							>
								<div className="mb-4 hidden">
									{/* biome-ignore lint/a11y/noLabelWithoutControl: eh */}
									<label className="text-gray-600 text-sm block mb-1">
										Streaming
									</label>
									<div className="p-2 border border-gray-200 rounded-md">
										<input
											type="checkbox"
											checked={params.stream}
											onChange={(e) =>
												setParams({ ...params, stream: e.target.checked })
											}
										/>
									</div>
								</div>
							</div>
						</section>

						<div className="bg-ai h-px mx-2 mt-2 opacity-25" />
						<McpServers onToolsUpdate={handleToolsUpdate} onResourcesUpdate={handleResourcesUpdate} onPromptsUpdate={handlePromptsUpdate} />
						
						{/* Debug Panel */}
						<div className="bg-ai h-px mx-2 mt-2 opacity-25" />
						<section className="rounded-lg bg-white p-4">
							<div className="flex items-center justify-between mb-2">
								<span className="text-lg font-semibold">Debug Logs</span>
								<button
									type="button"
									onClick={() => setDebugVisible(!debugVisible)}
									className="text-sm text-aws-orange hover:text-aws-orange-dark"
								>
									{debugVisible ? "Hide" : "Show"}
								</button>
							</div>
							
							{debugVisible && (
								<div className="space-y-2">
									<div className="flex gap-2 mb-2">
										<button
											onClick={() => setDebugLogs([])}
											className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
										>
											Clear Logs
										</button>
										<span className="text-xs text-gray-500 py-1">
											{debugLogs.length} entries
										</span>
									</div>
									<div className="max-h-80 overflow-y-auto bg-gray-50 p-2 rounded text-xs font-mono">
										{debugLogs.length === 0 ? (
											<div className="text-gray-400">No debug logs yet...</div>
										) : (
											debugLogs.map((log, index) => (
												<div key={index} className={`mb-1 ${
													log.level === 'error' ? 'text-red-600' :
													log.level === 'warn' ? 'text-yellow-600' :
													'text-gray-700'
												}`}>
													<span className="text-gray-400">[{log.timestamp}]</span>{' '}
													<span className="font-semibold">{log.level.toUpperCase()}:</span>{' '}
													{log.message}
												</div>
											))
										)}
									</div>
								</div>
							)}
						</section>
					</div>

					<div
						ref={messageElement}
						className="md:w-2/3 w-full h-full md:ml-6 md:rounded-lg md:shadow-md bg-white relative overflow-auto flex flex-col"
					>
						<div className="bg-ai h-[3px] hidden md:block" />
						
						{/* Chat Header with Thinking Tokens Toggle */}
						<div className="flex items-center justify-between p-4 border-b border-gray-100">
							<h2 className="text-lg font-semibold text-gray-800">Chat</h2>
							<button
								type="button"
								onClick={() => setShowThinkingTokens(!showThinkingTokens)}
								className={`px-3 py-1 text-xs rounded-md border transition-colors ${
									showThinkingTokens
										? "bg-aws-orange/10 border-aws-orange/30 text-aws-orange-dark"
										: "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200"
								}`}
								title="Toggle thinking tokens visibility"
							>
								{showThinkingTokens ? "Hide" : "Show"} Thinking
							</button>
						</div>
						
						<ul className="pb-6 px-6 pt-6">
							{messages.map((message) => (
								<div key={message.id}>
									{!message.parts.some((p) => p.type !== "text") ? null : (
										<li className="mb-3 flex flex-col items-start border-b border-b-gray-100 w-full pb-3">
											{message.parts.map((part, i) =>
												part.type === "file" ? (
													part.mimeType.startsWith("image/") ? (
														<img
															// biome-ignore lint/suspicious/noArrayIndexKey: it's fine
															key={i}
															className="max-w-md mx-auto"
															src={`data:${part.mimeType};base64,${part.data}`}
															// biome-ignore lint/a11y/noRedundantAlt: it's fine
															alt="Image from tool call response"
														/>
													) : null
												) : part.type === "tool-invocation" ? (
													// biome-ignore lint/suspicious/noArrayIndexKey: <expla	nation>
													<div key={i}>
														<div className="w-full text-center italic text-xs text-gray-400 font-mono max-h-20 overflow-auto break-all px-2 whitespace-pre-line">
															[tool] {part.toolInvocation.toolName}(
															{JSON.stringify(
																part.toolInvocation.args,
															)}
															) =&gt;&nbsp;
															{part.toolInvocation.state === "call" &&
															status === "ready"
																? "awaiting confirmation..."
																: part.toolInvocation.state ===
																		"call"
																	? "pending..."
																	: part.toolInvocation.state ===
																			"result"
																		? part.toolInvocation.result
																		: null}
														</div>
														{part.toolInvocation.state === "result" &&
														part.toolInvocation.result.match(
															/\[blob:.*]/,
														) ? (
															<img
																className="block max-w-md mx-auto mt-3"
																src={
																	part.toolInvocation.result.match(
																		/\[(blob:.*)]/,
																	)[1]
																}
																// biome-ignore lint/a11y/noRedundantAlt: it's fine
																alt="Image from tool call response"
															/>
														) : null}
													</div>
												) : null,
											)}
										</li>
									)}
									{message.content ? (
										<li className="mb-3 flex items-start border-b border-b-gray-100 w-full py-2">
											<div className="mr-3 w-[80px]">
												<button
													type="button"
													className={`px-3 py-2 bg-aws-orange/10 hover:bg-aws-orange/20 rounded-lg text-sm capitalize cursor-pointer ${
														(streaming || loading) &&
														"pointer-events-none"
													}`}
												>
													{message.role}
												</button>
											</div>
											<div className="relative grow">
												{message.role === 'assistant' ? (
													<div className="rounded-md p-3 w-full mt-[-6px] bg-gray-50 markdown-content">
														<ReactMarkdown 
															remarkPlugins={[remarkGfm]}
															components={{
																code: ({node, className, children, ...props}: any) => {
																	const match = /language-(\w+)/.exec(className || '');
																	const inline = !match;
																	return !inline && match ? (
																		<pre className="bg-gray-800 text-white p-3 rounded overflow-x-auto my-2">
																			<code className={className} {...props}>
																				{children}
																			</code>
																		</pre>
																	) : (
																		<code className="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono" {...props}>
																			{children}
																		</code>
																	);
																},
																pre: ({children}: any) => <>{children}</>,
															}}
														>
															{filterThinkingTokens(message.content)}
														</ReactMarkdown>
													</div>
												) : (
													<TextareaAutosize
														className={`rounded-md p-3 w-full resize-none mt-[-6px] hover:bg-gray-50 ${
															(streaming || loading) &&
															"pointer-events-none"
														}`}
														value={filterThinkingTokens(message.content)}
														disabled={true}
														onChange={handleInputChange}
													/>
												)}
											</div>
										</li>
									) : null}
								</div>
							))}

							{!loading ? null : (
								<li className="mb-3 flex items-start border-b border-b-gray-100 w-full py-2">
									<div className="mr-3 w-[80px]">
										<button
											type="button"
											className="px-3 py-2 bg-aws-orange/10 hover:bg-aws-orange/20 rounded-lg text-sm capitalize cursor-pointer pointer-events-none"
										>
											Assistant
										</button>
									</div>
									<div className="relative grow">
										<TextareaAutosize
											className="rounded-md p-3 w-full resize-none mt-[-6px] hover:bg-gray-50 pointer-events-none"
											value="..."
											disabled={true}
											onChange={handleInputChange}
										/>
									</div>
								</li>
							)}
						</ul>

						<div className="sticky mt-auto bottom-0 left-0 right-0 bg-white border-t border-t-gray-200">
							{/* Message Input Area */}
							<div className="flex items-start p-4 gap-3">
								<div className="w-[80px] flex-shrink-0">
									<button
										type="button"
										className="px-3 py-2 bg-aws-orange/10 hover:bg-aws-orange/20 rounded-lg text-sm capitalize cursor-pointer"
									>
										User
									</button>
								</div>
								<div className="flex-1">
									<TextareaAutosize
										className="w-full p-3 border border-gray-200 rounded-md resize-none hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-aws-orange/20 focus:border-aws-orange"
										placeholder="Enter a message... (Use @prompt_name to execute prompts)"
										value={input}
										disabled={loading || streaming}
										onChange={handleInputChangeWithSuggestions}
										onKeyDown={(e) => {
											// Send message on Enter, but allow Shift+Enter for new lines
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault();
												if (input.trim() && !loading && !streaming) {
													handleSubmit();
												}
											}
										}}
										minRows={1}
										maxRows={6}
									/>
								</div>
								<div className="flex items-end gap-2">
									<button
										type="button"
										onClick={() => {
											setError("");
											setMessages([]);
										}}
										className={`px-4 py-2 text-gray-500 hover:text-gray-700 rounded-md border border-gray-200 hover:bg-gray-50 ${
											(streaming || loading) && "pointer-events-none opacity-50"
										}`}
									>
										Clear
									</button>
									<button
										type="button"
										disabled={loading || streaming || !input.trim()}
										onClick={handleSubmit}
										className={`bg-ai-loop bg-size-[200%_100%] hover:animate-gradient-background ${
											loading || streaming ? "animate-gradient-background" : ""
										} ${
											!input.trim() && !loading && !streaming ? "opacity-50 cursor-not-allowed" : ""
										} text-white rounded-md shadow-md py-2 px-6 flex items-center`}
									>
										{loading || streaming ? "Sending..." : "Send"}
										<div className="ml-2 mt-[2px]">
											<SparkleIcon />
										</div>
									</button>
								</div>
							</div>
							
							{/* Status/Error Message */}
							{error ? (
								<div className="px-4 pb-2">
									<div className="text-sm text-red-600">{error}</div>
								</div>
							) : (
								<div className="px-4 pb-2">
									<div className="text-xs text-gray-400">
										Press Enter to send • Shift+Enter for new line • ⌘/Ctrl+Enter also works
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				<Footer />
			</div>
		</main>
	);
}
