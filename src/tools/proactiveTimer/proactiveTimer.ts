// ⚠️ DORMANT CODE — not wired into the app.
//
// Proactive messaging timer. Kept around for learning / future use.
// To enable: import `setupProactiveMessaging(app)` from app.ts and call it,
// and inside the message handler add:
//     conversationRefs.set(activity.from.id, activity.conversation.id);
//     startProactiveTimer(app);

import type { App } from "@microsoft/teams.apps";
import config from "../../config";
import { getFoundryClient } from "../../foundry/foundryClient";

// userId -> conversationId. In production, persist this to a database.
export const conversationRefs = new Map<string, string>();

/** Send a proactive message to a user by their stored conversation ID */
export async function sendProactiveMessage(app: App, userId: string, message: string) {
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

/** Ask the Foundry agent to generate a proactive message (not static!) */
export async function generateProactiveMessage(_userId: string): Promise<string> {
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

let proactiveTimerStarted = false;

/** Start a timer that sends a proactive message to every known user every 30s. */
export function startProactiveTimer(app: App) {
  if (proactiveTimerStarted) return;
  proactiveTimerStarted = true;
  console.log("[proactive] Timer started — will message all users every 30s");

  setInterval(async () => {
    if (conversationRefs.size === 0) {
      console.log("[proactive] No users to message yet (send a message to the bot first)");
      return;
    }
    for (const [userId] of conversationRefs) {
      const message = await generateProactiveMessage(userId);
      console.log(`[proactive] Sending to ${userId}: ${message}`);
      await sendProactiveMessage(app, userId, message);
    }
  }, 30_000);
}
