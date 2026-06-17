import { Tool } from "./types";

/**
 * Builds OpenAI-style function/tool definitions from the registered Tools.
 * Each tool brings its own JSON Schema via `tool.parameters`.
 */
export function getToolDefinitions(tools: Tool[]) {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}