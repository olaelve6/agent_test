import { CardFactory } from "botbuilder";
import { LocalStorage } from "@microsoft/teams.common";
import { getFoundryClient } from "../foundry/foundryClient";
import { AGENT_NAME } from "../foundry/setupAgent";
import { tools } from "../tools/toolRegistry";
import { createFileDownloadCard } from "../tools/cvBuilder/fileDownload/fileDownloadCard";

const toolsByName = new Map(tools.map((t) => [t.name, t]));

export interface FoundryChatParams {
  conversationKey: string;
  userText: string;
  /** Optional developer/system message prepended on first turn (e.g. user context). */
  developerMessage?: string;
  storage: LocalStorage;
  /** Used to send adaptive-card attachments back to the channel (e.g. file downloads). */
  send: (message: any) => Promise<unknown>;
}

/**
 * Runs one user turn through the Foundry Responses API, handling the
 * function-tool call loop. Returns the final text output.
 */
export async function runFoundryChat(params: FoundryChatParams): Promise<string> {
  const { conversationKey, userText, developerMessage, storage, send } = params;

  const foundryClient = getFoundryClient();
  const openai = foundryClient.getOpenAIClient() as any;

  // Get or create a Foundry conversation for this Teams conversation.
  let foundryConversationId = storage.get(`foundry:${conversationKey}`);
  if (!foundryConversationId) {
    const conversation = await openai.conversations.create();
    foundryConversationId = conversation.id;
    storage.set(`foundry:${conversationKey}`, foundryConversationId);
  }

  // Build input: prepend developer message (user context) when provided.
  const inputItems: any[] = [];
  if (developerMessage) {
    inputItems.push({
      type: "message",
      role: "developer",
      content: developerMessage,
    });
  }
  inputItems.push({
    type: "message",
    role: "user",
    content: userText,
  });

  let response = await openai.responses.create(
    {
      conversation: foundryConversationId,
      input: inputItems,
    },
    {
      body: {
        agent_reference: { name: AGENT_NAME, type: "agent_reference" },
      },
    }
  );

  // Tool call loop: handle function_call items from the model.
  // Built-in tools (web_search, work_iq, etc.) are resolved server-side
  // by Foundry. Only custom function tools arrive here for local execution.
  while (response.output.some((item: any) => item.type === "function_call")) {
    const toolOutputs: any[] = [];

    for (const item of response.output) {
      if (item.type !== "function_call") continue;

      const toolName = item.name;
      const toolArgs = JSON.parse(item.arguments);
      const tool = toolsByName.get(toolName);

      if (!tool) {
        toolOutputs.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
        });
        continue;
      }

      console.log(`[tool] ${toolName}`, toolArgs);
      const result = await tool.execute(toolArgs);
      console.log(`[tool] ${toolName} →`, result);

      // If the tool produced a downloadable file, render a download card
      if (result && result.type === "fileDownload") {
        const card = createFileDownloadCard({
          filename: result.filename,
          downloadUrl: result.downloadUrl,
          description: result.cardDescription ?? result.description,
          previewBody: result.previewBody,
        });
        await send({
          type: "message",
          attachments: [CardFactory.adaptiveCard(card)],
        });
      }

      toolOutputs.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(result),
      });
    }

    response = await openai.responses.create(
      {
        conversation: foundryConversationId,
        input: toolOutputs,
      },
      {
        body: {
          agent_reference: { name: AGENT_NAME, type: "agent_reference" },
        },
      }
    );
  }

  return response.output_text || "I couldn't generate a response.";
}
