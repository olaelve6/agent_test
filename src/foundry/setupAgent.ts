import { getFoundryClient } from "./foundryClient";
import config from "../config";
import { tools } from "../tools/toolRegistery";
import { getToolDefinitions } from "../tools/getToolDefinitions";
import * as fs from "fs";
import * as path from "path";

const AGENT_NAME = "atea-assistant";

function loadInstructions(): string {
  const instructionsFilePath = path.join(__dirname, "..", "app", "instructions.txt");
  return fs.readFileSync(instructionsFilePath, "utf-8").trim();
}

/**
 * Creates (or updates) the agent version in Foundry with both built-in
 * tools and custom function tools. Call on bot startup.
 *
 * Built-in tools (Web Search, Work IQ, etc.) are handled server-side by Foundry.
 * Custom function tools (quiz, Flowcase, CV) are executed locally in the bot —
 * Foundry returns the tool call, we run the function, and submit the result back.
 */
export async function ensureAgent() {
  const client = getFoundryClient();

  const foundryTools: any[] = [];

  // --- Built-in Foundry tools ---
  foundryTools.push({ type: "web_search_preview" });
  // Uncomment to enable:
  // foundryTools.push({ type: "code_interpreter" });
  // foundryTools.push({ type: "file_search" });

  // Work IQ (optional — requires M365 Copilot license per user)
  if (config.workIqConnectionId) {
    foundryTools.push({
      type: "work_iq_preview",
      project_connection_id: config.workIqConnectionId,
    });
  }

  // --- Custom function tools (executed locally) ---
  // Convert our Tool[] definitions to Foundry's function tool format
  const toolDefs = getToolDefinitions(tools);
  for (const def of toolDefs) {
    foundryTools.push({
      type: "function",
      name: def.function.name,
      description: def.function.description,
      parameters: def.function.parameters,
    });
  }

  const agent = await client.agents.createVersion(AGENT_NAME, {
    kind: "prompt",
    model: config.foundryModelName!,
    instructions: loadInstructions(),
    tools: foundryTools,
  });

  console.log(`[Foundry] Agent ready: ${agent.name} v${agent.version}`);
  return agent;
}

export { AGENT_NAME };
