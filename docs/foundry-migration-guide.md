# Migration Guide: Teams Bot → Foundry Agent Service

This guide migrates your existing Teams bot from direct Azure OpenAI calls to the **Foundry Agent Service Responses API**, giving you access to built-in tools (Work IQ, Web Search, Code Interpreter, File Search) while keeping your custom tools (Adaptive Cards, Flowcase, quiz, CV builder).

---

## Architecture: Before vs After

### Before (current)

```
Teams User → Bot (Node.js) → Azure OpenAI (direct, ChatPrompt + OpenAIChatModel)
                            → Custom tools (Flowcase, quiz, CV builder)
```

### After (Foundry)

```
Teams User → Bot (Node.js) → Foundry Responses API (AIProjectClient)
                            → Built-in tools (Work IQ, Web Search, Code Interpreter)
                            → Custom tools (Flowcase, quiz, CV builder) ← unchanged
```

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Azure subscription | Same one you're using now |
| Microsoft Foundry project | Created at https://ai.azure.com |
| Model deployment in Foundry | e.g., `gpt-4o` or `gpt-4.1` |
| `@azure/ai-projects` npm package | New dependency |
| `@azure/identity` npm package | For authentication |
| M365 Copilot license (per user) | **Only if using Work IQ** |
| Entra app registration | **Only if using Work IQ** |

---

## Step 1: Create a Foundry Project

1. Go to https://ai.azure.com
2. Select **+ Create project**
3. Choose your subscription, resource group, and region
4. Deploy a model (e.g., `gpt-4o`) under **Model catalog** → **Deploy**
5. Copy your **Project endpoint** (format: `https://<resource>.ai.azure.com/api/projects/<project>`)

---

## Step 2: Set Up Identity & RBAC

Your bot needs to authenticate with Foundry. Two options:

### Option A: Managed Identity (recommended for production)

Your bot's existing User-Assigned Managed Identity can be reused:

1. In Azure Portal → your Foundry project → **Access control (IAM)**
2. Add role assignment: **Foundry User** → assign to your bot's managed identity (`CLIENT_ID`)

### Option B: Service Principal (for local dev)

Use `DefaultAzureCredential` which falls back to Azure CLI login locally.

---

## Step 3: Install New Dependencies

```bash
npm install @azure/ai-projects @azure/identity
```

---

## Step 4: Update Environment Variables

Add these to your `.env` / `.localConfigs`:

```env
# Foundry (new)
FOUNDRY_PROJECT_ENDPOINT=https://<resource>.ai.azure.com/api/projects/<project>
FOUNDRY_MODEL_NAME=gpt-4o          # your deployed model name

# Work IQ (optional - only if using Work IQ)
WORKIQ_CONNECTION_ID=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<account>/projects/<project>/connections/<connection-name>

# Keep existing
CLIENT_ID=...
TENANT_ID=...
CLIENT_SECRET=...
FLOWCASE_BASE_URL=...
FLOWCASE_API_KEY=...
BOT_ENDPOINT=...
```

You can **remove** these (no longer needed):

```env
# AZURE_OPENAI_API_KEY        ← Foundry uses managed identity instead
# AZURE_OPENAI_ENDPOINT       ← replaced by FOUNDRY_PROJECT_ENDPOINT
# AZURE_OPENAI_DEPLOYMENT_NAME ← replaced by FOUNDRY_MODEL_NAME
```

---

## Step 5: Update `config.ts`

```typescript
const config = {
  MicrosoftAppId: process.env.CLIENT_ID,
  MicrosoftAppType: process.env.BOT_TYPE,
  MicrosoftAppTenantId: process.env.TENANT_ID,
  MicrosoftAppPassword: process.env.CLIENT_SECRET,

  // Foundry (replaces Azure OpenAI direct)
  foundryProjectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT,
  foundryModelName: process.env.FOUNDRY_MODEL_NAME,

  // Work IQ (optional)
  workIqConnectionId: process.env.WORKIQ_CONNECTION_ID,

  // Flowcase (unchanged)
  flowcaseBaseUrl: process.env.FLOWCASE_BASE_URL ?? "https://servicehub.atea.com/flowcase",
  flowcaseApiKey: process.env.FLOWCASE_API_KEY,

  botEndpoint: process.env.BOT_ENDPOINT ?? `http://localhost:${process.env.PORT ?? 3978}`,
};

export default config;
```

---

## Step 6: Create Foundry Client Module

Create `src/foundry/foundryClient.ts`:

```typescript
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import config from "../config";

let client: AIProjectClient | null = null;

export function getFoundryClient(): AIProjectClient {
  if (!client) {
    const credential = config.MicrosoftAppType === "UserAssignedMsi"
      ? new ManagedIdentityCredential({ clientId: config.MicrosoftAppId })
      : new DefaultAzureCredential();

    client = new AIProjectClient(config.foundryProjectEndpoint!, credential);
  }
  return client;
}
```

---

## Step 7: Create the Foundry Agent (one-time setup)

Create `src/foundry/setupAgent.ts` — run this once to create your agent in Foundry:

```typescript
import { getFoundryClient } from "./foundryClient";
import config from "../config";

/**
 * Creates (or updates) the agent version in Foundry with built-in tools.
 * Run once during deployment, or on bot startup.
 */
export async function ensureAgent(agentName: string = "atea-assistant") {
  const client = getFoundryClient();

  const tools: any[] = [];

  // Built-in tools from Foundry
  tools.push({ type: "web_search_preview" });
  // tools.push({ type: "code_interpreter" });    // Uncomment if needed
  // tools.push({ type: "file_search" });          // Uncomment if needed

  // Work IQ (optional - requires M365 Copilot license)
  if (config.workIqConnectionId) {
    tools.push({
      type: "work_iq_preview",
      project_connection_id: config.workIqConnectionId,
    });
  }

  // Custom tools (Flowcase, quiz, CV) — registered as function definitions
  // so the model knows about them. Execution happens in your bot code.
  tools.push({
    type: "function",
    name: "createQuiz",
    description: "Create an interactive multiple-choice quiz on a given topic.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The topic for the quiz" },
        numberOfQuestions: { type: "number", description: "How many questions (2-10)" },
        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
      },
      required: ["topic"],
    },
  });

  tools.push({
    type: "function",
    name: "findFlowcaseUser",
    description: "Look up an employee in Flowcase by email or domain username.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email or domain\\username to search for" },
      },
      required: ["email"],
    },
  });

  tools.push({
    type: "function",
    name: "createCvFile",
    description: "Package CV entries into a downloadable JSON file with preview.",
    parameters: {
      type: "object",
      properties: {
        entries: { type: "object", description: "CV entries object following the CV schema" },
      },
      required: ["entries"],
    },
  });

  const agent = await client.agents.createVersion(agentName, {
    kind: "prompt",
    model: config.foundryModelName!,
    instructions: "", // Will be overridden per-request with user context
    tools,
  });

  console.log(`[Foundry] Agent created: ${agent.name} v${agent.version}`);
  return agent;
}
```

> **Note:** The function tools are registered so the model knows they exist.
> When the model calls them, Foundry returns the tool call to your code,
> and you execute them locally (same as today).

---

## Step 8: Rewrite the Message Handler

This is the main change. Replace `ChatPrompt`/`OpenAIChatModel` with the Foundry Responses API.

Replace the contents of `src/app/app.ts`:

```typescript
import { App } from "@microsoft/teams.apps";
import { MessageActivity, TokenCredentials } from "@microsoft/teams.api";
import { ManagedIdentityCredential } from "@azure/identity";
import { LocalStorage } from "@microsoft/teams.common";
import * as fs from "fs";
import * as path from "path";
import config from "../config";
import { CardFactory } from "botbuilder";
import { tools } from "../tools/toolRegistery";
import { createQuizCard } from "../tools/quiz/quizUtils";
import { createFileDownloadCard } from "../tools/fileDownload/fileDownloadCard";
import { registerDownloadRoute } from "../tools/fileDownload/downloadRoute";
import { getFoundryClient } from "../foundry/foundryClient";
import { ensureAgent } from "../foundry/setupAgent";
import {
  loadUserContext,
  formatUserContext,
  UserContext,
} from "../context/userContext";

const storage = new LocalStorage();
const userContextCache = new Map<string, UserContext>();

function loadInstructions(): string {
  const instructionsFilePath = path.join(__dirname, "instructions.txt");
  return fs.readFileSync(instructionsFilePath, "utf-8").trim();
}

const instructions = loadInstructions();

const AGENT_NAME = "atea-assistant";
let agentReady: Promise<any>;

const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
      clientId: process.env.CLIENT_ID,
    });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, { tenantId });
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

registerDownloadRoute(app);

// Ensure agent exists on startup
agentReady = ensureAgent(AGENT_NAME).catch((err) => {
  console.error("[Foundry] Failed to create agent:", err);
});

app.on("message", async ({ send, stream, activity }) => {
  // --- Adaptive Card submit (quiz grading) — unchanged ---
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
    await send(`**Score: ${correctCount} / ${answerKey.length}**\n\n${lines.join("\n\n")}`);
    return;
  }

  // --- Main message handling via Foundry ---
  const conversationKey = `${activity.conversation.id}/${activity.from.id}`;

  // Load user context (unchanged)
  let userCtx = userContextCache.get(conversationKey);
  if (!userCtx) {
    const fresh = await loadUserContext();
    if (fresh) {
      userCtx = fresh;
      userContextCache.set(conversationKey, fresh);
    }
  }

  try {
    await agentReady;

    const foundryClient = getFoundryClient();
    const openai = foundryClient.getOpenAIClient();

    // Get or create a Foundry conversation for this Teams conversation
    let foundryConversationId = storage.get(`foundry:${conversationKey}`);
    if (!foundryConversationId) {
      const conversation = await (openai as any).conversations.create();
      foundryConversationId = conversation.id;
      storage.set(`foundry:${conversationKey}`, foundryConversationId);
    }

    const augmentedInstructions = userCtx
      ? `${instructions}\n\n${formatUserContext(userCtx)}`
      : instructions;

    // Send to Foundry Responses API
    let response = await (openai as any).responses.create(
      {
        conversation: foundryConversationId,
        input: activity.text,
        instructions: augmentedInstructions,
      },
      {
        body: {
          agent_reference: { name: AGENT_NAME, type: "agent_reference" },
        },
      }
    );

    // Handle function calls (custom tools) — loop until text response
    while (response.output.some((item: any) => item.type === "function_call")) {
      const toolOutputs: any[] = [];

      for (const item of response.output) {
        if (item.type !== "function_call") continue;

        const toolName = item.name;
        const toolArgs = JSON.parse(item.arguments);
        const tool = tools.find((t) => t.name === toolName);

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

        // Render Adaptive Cards for special tool outputs
        if (result && result.type === "quiz") {
          const card = createQuizCard(result.questions);
          await send({
            type: "message",
            attachments: [CardFactory.adaptiveCard(card)],
          });
        }

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

      // Submit tool outputs back to Foundry
      response = await (openai as any).responses.create(
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

    // Extract text response
    const textOutput = response.output_text || "I couldn't generate a response.";

    const responseActivity = new MessageActivity(textOutput).addAiGenerated().addFeedback();
    await send(responseActivity);
  } catch (error) {
    console.error(error);
    await send("The agent encountered an error or bug.");
  }
});

app.on("message.submit.feedback", async ({ activity }) => {
  console.log("Your feedback is " + JSON.stringify(activity.value));
});

export default app;
```

---

## Step 9: Update `tsconfig.json` (if needed)

Ensure these compiler options are set:

```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

---

## Step 10: Set Up Work IQ Connection (Optional)

Skip this step if you don't need Work IQ (email/calendar/Teams access).

### 10a: Provision the Work IQ service principal

A **Global Admin** must do this once per tenant:

1. Go to https://developer.microsoft.com/graph/graph-explorer
2. Run:
   ```http
   POST https://graph.microsoft.com/v1.0/servicePrincipals
   Content-Type: application/json

   {
     "appId": "fdcc1f02-fc51-4226-8753-f668596af7f7"
   }
   ```
3. `201 Created` = success. `409 Conflict` = already exists (fine).

### 10b: Create an Entra app registration

1. Microsoft Entra admin center → **App registrations** → **New registration**
2. Name: e.g., `Atea Agent - Work IQ`
3. Supported account types: **Single tenant**
4. Under **API permissions** → **Add a permission** → **APIs my organization uses**
5. Search for **Work IQ** → **Delegated permissions** → select `WorkIQAgent.Ask`
6. **Grant admin consent**

### 10c: Create the Foundry connection

1. In your Foundry project → **Settings** → **Connected resources** → **+ New connection**
2. Connection type: Follow the Work IQ guided setup
3. Set the endpoint to: `https://agent365.svc.cloud.microsoft`
4. Note the full resource ID — this goes into `WORKIQ_CONNECTION_ID`

---

## Step 11: Deploy & Test

### Local testing

```bash
# Ensure you're logged in to Azure CLI (for DefaultAzureCredential)
az login

# Start the bot
npm run dev
```

### What to verify

- [ ] Bot responds to messages (basic text)
- [ ] Web search works (ask "What's the weather in Oslo?")
- [ ] Custom tools still work (quiz, Flowcase lookup, CV builder)
- [ ] Adaptive Cards render correctly
- [ ] File downloads still work
- [ ] Work IQ works if configured (ask "What meetings do I have today?")

### Production deployment

Your deployment pipeline stays the same — it's still a Node.js app on Azure App Service. The only infra changes:

1. Add `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_NAME` to App Service env vars
2. Assign **Foundry User** role to the bot's managed identity on the Foundry project
3. Remove `AZURE_OPENAI_API_KEY` (no longer needed — uses managed identity)

---

## Summary of Changes

| File | Change |
|------|--------|
| `package.json` | Add `@azure/ai-projects`, `@azure/identity` |
| `src/config.ts` | Replace OpenAI vars with Foundry vars |
| `src/foundry/foundryClient.ts` | **New** — Foundry client singleton |
| `src/foundry/setupAgent.ts` | **New** — Agent creation with tools |
| `src/app/app.ts` | Replace `ChatPrompt`/`OpenAIChatModel` with Foundry Responses API |
| `src/tools/*` | **No changes** — custom tools stay exactly as they are |
| `src/context/userContext.ts` | **No changes** |
| `.env` | Add Foundry endpoint, remove OpenAI key |
| `infra/azure.bicep` | Add Foundry User role assignment |

---

## What You Gain

| Capability | Before | After |
|-----------|--------|-------|
| Web search with citations | ❌ | ✅ Built-in |
| Code Interpreter (Python sandbox) | ❌ | ✅ Built-in |
| File Search (vector/RAG) | ❌ | ✅ Built-in |
| Work IQ (emails, calendar, Teams) | ❌ | ✅ Built-in |
| Conversation history management | Manual (LocalStorage) | ✅ Foundry-managed |
| Custom tools (quiz, CV, Flowcase) | ✅ | ✅ Unchanged |
| Adaptive Cards | ✅ | ✅ Unchanged |
| Streaming responses | ✅ | ⚠️ Requires additional setup |

---

## Streaming (Optional Enhancement)

The Responses API supports streaming. To enable in 1:1 chats:

```typescript
const streamResponse = await (openai as any).responses.create(
  {
    conversation: foundryConversationId,
    input: inputText,
    stream: true,
  },
  {
    body: { agent_reference: { name: AGENT_NAME, type: "agent_reference" } },
  }
);

for await (const event of streamResponse) {
  if (event.type === "response.output_text.delta") {
    stream.emit(event.delta);
  }
}
stream.emit(new MessageActivity().addAiGenerated().addFeedback());
```

---

## FAQ

**Q: Do I need to rebuild/redeploy for prompt changes?**
A: No. Instructions are passed per-request. Update `instructions.txt` and redeploy your bot as normal (same as today).

**Q: What about the MCP endpoint `agent365.svc.cloud.microsoft/agents/servers/mcp_TeamsServer`?**
A: You don't call it directly. When you add `work_iq_preview` as a tool, Foundry routes to that endpoint internally via A2A.

**Q: Can I add/remove Foundry tools without redeploying?**
A: You'd need to call `createVersion` again with the updated tools list. Make this configurable via env vars and the bot picks up new config on restart.

**Q: What's the cost?**
A: Foundry charges per-token (same as Azure OpenAI) + tool usage (Web Search uses Bing pricing, Code Interpreter has compute costs). Custom tools (your code) have no additional Foundry cost.

**Q: Do I need a Docker container?**
A: No. This approach keeps your bot as a regular Node.js app. Docker/Hosted Agents are only needed if you want Foundry to manage your compute — which you don't need since you already deploy to App Service.
