import { App } from "@microsoft/teams.apps";
import { MessageActivity, TokenCredentials } from '@microsoft/teams.api';
import { ManagedIdentityCredential } from '@azure/identity';
import { LocalStorage } from "@microsoft/teams.common";
import * as fs from 'fs';
import * as path from 'path';
import config from "../config";
import { CardFactory } from "botbuilder";
import { tools } from "../tools/toolRegistery";
import { createQuizCard } from "../tools/quiz/quizUtils";
import { createFileDownloadCard } from "../tools/fileDownload/fileDownloadCard";
import { registerDownloadRoute } from "../tools/fileDownload/downloadRoute";
import { getFoundryClient } from "../foundry/foundryClient";
import { ensureAgent, AGENT_NAME } from "../foundry/setupAgent";
import {
  loadUserContext,
  formatUserContext,
  UserContext
} from "../context/userContext";

// Create storage for conversation history
const storage = new LocalStorage();

// In-memory cache for the auto-loaded user context, keyed by conversation.
const userContextCache = new Map<string, UserContext>();

// Load instructions from file on initialization
function loadInstructions(): string {
  const instructionsFilePath = path.join(__dirname, "instructions.txt");
  return fs.readFileSync(instructionsFilePath, 'utf-8').trim();
}

const instructions = loadInstructions();

// Agent readiness promise — resolves once the Foundry agent version exists
let agentReady: Promise<any>;

const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
        clientId: process.env.CLIENT_ID
      });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId: tenantId
    });
   
    return tokenResponse.token;
  };
};

// Configure authentication using TokenCredentials
const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || '',
  token: createTokenFactory()
};

const credentialOptions = config.MicrosoftAppType === "UserAssignedMsi" ? { ...tokenCredentials } : undefined;

// Create the app with storage
const app = new App({
  ...credentialOptions,
  storage
});

// --- Proactive messaging ---
// Store conversation IDs so we can message users later.
// In production, persist this to a database.
const conversationRefs = new Map<string, string>(); // userId -> conversationId

/** Send a proactive message to a user by their stored conversation ID */
export async function sendProactiveMessage(userId: string, message: string) {
  const conversationId = conversationRefs.get(userId);
  if (!conversationId) {
    console.warn(`[proactive] No conversation ID for user: ${userId}`);
    return false;
  }
  try {
    await app.send(conversationId, { type: "message", text: message });
    console.log(`[proactive] Sent message to ${userId}`);
    return true;
  } catch (err) {
    console.error(`[proactive] Failed to send to ${userId}:`, err);
    return false;
  }
}

// Register the GET /download/:id route so the user can fetch files the
// bot has generated via the fileDownload tools.
registerDownloadRoute(app);

/** Ask the Foundry agent to generate a proactive message (not static!) */
async function generateProactiveMessage(userId: string): Promise<string> {
  const topics = [
    "a fun tech fact", "a productivity tip", "a random joke", 
    "a motivational quote from a famous person", "a fun question to ask the user",
    "a weird historical fact", "a coding tip", "a wellness reminder",
    "an interesting science fact", "a creative writing prompt"
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];
  try {
    const openai = (getFoundryClient() as any).getOpenAIClient();
    const response = await openai.responses.create({
      model: config.foundryModelName,
      temperature: 1.3,
      instructions: `You are a friendly assistant sending a short proactive message. Today's topic: ${topic}. Keep it to 1-2 sentences. Be creative, surprising, and DIFFERENT every time. Never start with "Hey there". Write in norwegian`,
      input: `Generate a brief message about: ${topic}. Be unique and surprising.`,
    });
    return response.output_text || "👋 Just checking in!";
  } catch (err) {
    console.error("[proactive] Failed to generate message:", err);
    return "👋 Hey! I'm here if you need anything.";
  }
}

// --- Timer: send a proactive message every 60 seconds (for testing) ---
let proactiveTimerStarted = false;
function startProactiveTimer() {
  if (proactiveTimerStarted) return;
  proactiveTimerStarted = true;
  console.log("[proactive] Timer started — will message all users every 30s");

  setInterval(async () => {
    if (conversationRefs.size === 0) {
      console.log("[proactive] No users to message yet (send a message to the bot first)");
      return;
    }
    for (const [userId] of conversationRefs) {
      // Agent generates a unique message each time
      const message = await generateProactiveMessage(userId);
      console.log(`[proactive] Sending to ${userId}: ${message}`);
      await sendProactiveMessage(userId, message);
    }
  }, 30_000); // every 30 seconds
}

// Ensure the Foundry agent version is created on startup
agentReady = ensureAgent().catch((err) => {
  console.error("[Foundry] Failed to create agent on startup:", err);
});

// Map of tool names to their execute functions for quick lookup
const toolsByName = new Map(tools.map((t) => [t.name, t]));

// Handle incoming messages
app.on('message', async ({ send, stream, activity }) => {

  // Save conversation ID for proactive messaging
  if (activity.from && activity.conversation) {
    conversationRefs.set(activity.from.id, activity.conversation.id);
    console.log(`[proactive] Stored conversation for user: ${activity.from.name || activity.from.id}`);
    // Start the proactive timer once we have at least one user
    startProactiveTimer();
  }

  // Adaptive Card submit: grade the quiz answers and reply with results.
  if (activity.value && Array.isArray((activity.value as any).quizAnswerKey)) {
    const value = activity.value as Record<string, any> & {
      quizAnswerKey: Array<{ question: string; correctAnswer: string }>;
    };
    const answerKey = value.quizAnswerKey;

    const missing = answerKey.some((_, idx) => !value[`answer_${idx}`]);
    if (missing) {
      await send("Please answer every question before submitting.");
      return;
    }

    let correctCount = 0;
    const lines = answerKey.map((entry, idx) => {
      const picked = value[`answer_${idx}`] as string;
      const isCorrect = picked === entry.correctAnswer;
      if (isCorrect) correctCount++;
      return isCorrect
        ? `✅ **${idx + 1}. ${entry.question}** — **${picked}**`
        : `❌ **${idx + 1}. ${entry.question}** — you picked **${picked}**, correct answer was **${entry.correctAnswer}**`;
    });

    await send(
      `**Score: ${correctCount} / ${answerKey.length}**\n\n${lines.join("\n\n")}`
    );
    return;
  }

  // --- Main message handling via Foundry Responses API ---
  const conversationKey = `${activity.conversation.id}/${activity.from.id}`;

  // Auto-load the current user's Flowcase profile once per conversation
  let userCtx = userContextCache.get(conversationKey);
  if (!userCtx) {
    const fresh = await loadUserContext();
    if (fresh) {
      userCtx = fresh;
      userContextCache.set(conversationKey, fresh);
      console.log("Loaded user context for conversation", conversationKey);
    } else {
      console.warn("Failed to load user context for conversation", conversationKey);
    }
  }

  const augmentedInstructions = userCtx
    ? `${instructions}\n\n${formatUserContext(userCtx)}`
    : instructions;

  try {
    await agentReady;

    const foundryClient = getFoundryClient();
    const openai = foundryClient.getOpenAIClient() as any;

    // Get or create a Foundry conversation for this Teams conversation.
    // Foundry manages the conversation history for us.
    let foundryConversationId = storage.get(`foundry:${conversationKey}`);
    if (!foundryConversationId) {
      const conversation = await openai.conversations.create();
      foundryConversationId = conversation.id;
      storage.set(`foundry:${conversationKey}`, foundryConversationId);
    }

    // Build input: prepend user context as a system-like developer message
    // (instructions can't be passed per-request when using agent_reference)
    const inputItems: any[] = [];
    if (userCtx) {
      inputItems.push({
        type: "message",
        role: "developer",
        content: augmentedInstructions,
      });
    }
    inputItems.push({
      type: "message",
      role: "user",
      content: activity.text,
    });

    // Send user message to Foundry
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

        // If the tool produced a quiz, render it as an Adaptive Card
        if (result && result.type === "quiz") {
          const card = createQuizCard(result.questions);
          await send({
            type: "message",
            attachments: [CardFactory.adaptiveCard(card)]
          });
        }

        // If the tool produced a downloadable file, render a download card
        if (result && result.type === "fileDownload") {
          const card = createFileDownloadCard({
            filename: result.filename,
            downloadUrl: result.downloadUrl,
            description: result.cardDescription ?? result.description,
            previewBody: result.previewBody
          });
          await send({
            type: "message",
            attachments: [CardFactory.adaptiveCard(card)]
          });
        }

        toolOutputs.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: JSON.stringify(result),
        });
      }

      // Submit tool results back to Foundry and get the next response
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

    // Extract the final text response
    const textOutput = response.output_text
      || "I couldn't generate a response.";

    const responseActivity = new MessageActivity(textOutput)
      .addAiGenerated()
      .addFeedback();
    await send(responseActivity);
  } catch (error) {
    console.error(error);
    await send("The agent encountered an error or bug.");
    await send("To continue to run this agent, please fix the agent source code.");
  }
});

app.on('message.submit.feedback', async ({ activity }) => {
  console.log("Your feedback is " + JSON.stringify(activity.value));
})

export default app;