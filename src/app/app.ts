import { App } from "@microsoft/teams.apps";
import { MessageActivity, TokenCredentials } from "@microsoft/teams.api";
import { ManagedIdentityCredential } from "@azure/identity";
import { LocalStorage } from "@microsoft/teams.common";
import * as fs from "fs";
import * as path from "path";
import config from "../config";
import { registerDownloadRoute } from "../tools/cvBuilder/fileDownload/downloadRoute";
import { ensureAgent } from "../foundry/setupAgent";
import {
  loadUserContext,
  formatUserContext,
  UserContext,
} from "../context/userContext";
import { runFoundryChat } from "./foundryChat";

// Storage for conversation history (Foundry conversation IDs, etc.)
const storage = new LocalStorage();

// In-memory cache for the auto-loaded user context, keyed by conversation.
const userContextCache = new Map<string, UserContext>();

// Load instructions from file on initialization
const instructions = fs
  .readFileSync(path.join(__dirname, "instructions.txt"), "utf-8")
  .trim();

const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
      clientId: process.env.CLIENT_ID,
    });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId: tenantId,
    });
    return tokenResponse.token;
  };
};

const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const credentialOptions =
  config.MicrosoftAppType === "UserAssignedMsi" ? { ...tokenCredentials } : undefined;

const app = new App({
  ...credentialOptions,
  storage,
});

// Register the GET /download/:id route so the user can fetch files the
// bot has generated via the fileDownload tools.
registerDownloadRoute(app);

// Ensure the Foundry agent version is created on startup
const agentReady = ensureAgent().catch((err) => {
  console.error("[Foundry] Failed to create agent on startup:", err);
});

app.on("message", async ({ send, activity }) => {
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

  const developerMessage = userCtx
    ? `${instructions}\n\n${formatUserContext(userCtx)}`
    : undefined;

  // Show a typing indicator while the agent is working. Teams hides it
  // after ~10s, so we re-send every few seconds until the response is ready.
  await send({ type: "typing" });
  const typingInterval = setInterval(() => {
    send({ type: "typing" }).catch(() => {});
  }, 2500);

  try {
    await agentReady;

    const textOutput = await runFoundryChat({
      conversationKey,
      userText: activity.text,
      developerMessage,
      storage,
      send,
    });

    const responseActivity = new MessageActivity(textOutput)
      .addAiGenerated()
      .addFeedback();
    await send(responseActivity);
  } catch (error) {
    console.error(error);
    await send("The agent encountered an error or bug.");
    await send("To continue to run this agent, please fix the agent source code.");
  } finally {
    clearInterval(typingInterval);
  }
});

app.on("message.submit.feedback", async ({ activity }) => {
  console.log("Your feedback is " + JSON.stringify(activity.value));
});

export default app;
