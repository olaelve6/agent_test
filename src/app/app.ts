import { App } from "@microsoft/teams.apps";
import { ChatPrompt } from "@microsoft/teams.ai";
import { LocalStorage } from "@microsoft/teams.common";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import { MessageActivity, TokenCredentials } from '@microsoft/teams.api';
import { ManagedIdentityCredential } from '@azure/identity';
import * as fs from 'fs';
import * as path from 'path';
import config from "../config";
import { CardFactory } from "botbuilder";
import { tools } from "../tools/toolRegistery";
import {getToolDefinitions} from "../tools/getToolDefinitions";
import { createQuizCard } from "../tools/quiz/quizUtils";
import { createFileDownloadCard } from "../tools/fileDownload/fileDownloadCard";
import { registerDownloadRoute } from "../tools/fileDownload/downloadRoute";
import {
  loadUserContext,
  formatUserContext,
  UserContext
} from "../context/userContext";

// Create storage for conversation history
const storage = new LocalStorage();

// In-memory cache for the auto-loaded user context, keyed by conversation.
// For multi-instance deploys, move this into `storage` instead.
const userContextCache = new Map<string, UserContext>();

// Load instructions from file on initialization
function loadInstructions(): string {
  const instructionsFilePath = path.join(__dirname, "instructions.txt");
  return fs.readFileSync(instructionsFilePath, 'utf-8').trim();
}

// Load instructions once at startup
const instructions = loadInstructions();

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

// Register the GET /download/:id route so the user can fetch files the
// bot has generated via the fileDownload tools.
registerDownloadRoute(app);

// Handle incoming messages
app.on('message', async ({ send, stream, activity }) => {

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

  //Get conversation history
  const conversationKey = `${activity.conversation.id}/${activity.from.id}`;
  const messages = storage.get(conversationKey) || [];

  // Auto-load the current user's Flowcase profile once per conversation
  // and inject it into the system prompt. This avoids relying on the
  // model to decide to call a lookup tool.
  let userCtx = userContextCache.get(conversationKey);
  if (!userCtx) {
    const fresh = await loadUserContext();
    if (fresh) {
      userCtx = fresh;
      userContextCache.set(conversationKey, fresh);
      console.log("Loaded user context for conversation", conversationKey, {
        ...fresh,
        // Don't log the default CV id, as it may be sensitive.
        default_cv_id: fresh.default_cv_id ? "(present)" : "(missing)"
       });
    } else {
      console.warn("Failed to load user context for conversation", conversationKey);
    }
  }
  const augmentedInstructions = userCtx
    ? `${instructions}\n\n${formatUserContext(userCtx)}`
    : instructions;

  try {
    const prompt = new ChatPrompt({
      messages,
      instructions: augmentedInstructions,
      model: new OpenAIChatModel({
        model: config.azureOpenAIDeploymentName,
        apiKey: config.azureOpenAIKey,
        endpoint: config.azureOpenAIEndpoint,
        apiVersion: "2024-10-21"
      })
    });

    // Register tools with the prompt. The SDK handles the tool-call loop
    // automatically (autoFunctionCalling defaults to true): when the model
    // emits a tool call, the matching handler is invoked, its result is fed
    // back into the conversation, and the model is called again until it
    // returns a normal text response.
    const toolDefinitions = getToolDefinitions(tools);
    const toolsByName = new Map(tools.map((t) => [t.name, t]));

    for (const def of toolDefinitions) {
      const tool = toolsByName.get(def.function.name);
      if (!tool) continue;

      prompt.function(
        def.function.name,
        def.function.description,
        def.function.parameters as any,
        async (args: any) => {
          console.log(`[tool] ${def.function.name}`, args);
          const result = await tool.execute(args);
          console.log(`[tool] ${def.function.name} →`, result);

          // If the tool produced a quiz, render it as an Adaptive Card so the
          // user gets the interactive card alongside the model's text reply.
          if (result && result.type === "quiz") {
            const card = createQuizCard(result.questions);
            await send({
              type: "message",
              attachments: [CardFactory.adaptiveCard(card)]
            });
          }

          // If the tool produced a downloadable file, render a card with
          // a download button pointing at our /download/:id route.
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

          // Return a string the model can incorporate into its final answer.
          return JSON.stringify(result);
        }
      );
    }

    if (activity.conversation.isGroup) {
      // If the conversation is a group chat, we need to send the final response
      // back to the group chat
      const response = await prompt.send(activity.text);
      const responseActivity = new MessageActivity(response.content).addAiGenerated().addFeedback();
      await send(responseActivity);
    } else {
        await prompt.send(activity.text, {
          onChunk: (chunk) => {
            stream.emit(chunk);
          },
        });
      // We wrap the final response with an AI Generated indicator
      stream.emit(new MessageActivity().addAiGenerated().addFeedback());
    }
    storage.set(conversationKey, messages);
  } catch (error) {
    console.error(error);
    await send("The agent encountered an error or bug.");
    await send("To continue to run this agent, please fix the agent source code.");
  }
});

app.on('message.submit.feedback', async ({ activity }) => {
  //add custom feedback process logic here
  console.log("Your feedback is " + JSON.stringify(activity.value));
})

export default app;