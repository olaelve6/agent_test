const config = {
  MicrosoftAppId: process.env.CLIENT_ID,
  MicrosoftAppType: process.env.BOT_TYPE,
  MicrosoftAppTenantId: process.env.TENANT_ID,
  MicrosoftAppPassword: process.env.CLIENT_SECRET,

  // Foundry Agent Service (replaces direct Azure OpenAI)
  foundryProjectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT,
  foundryModelName: process.env.FOUNDRY_MODEL_NAME,

  // Work IQ connection (optional — requires M365 Copilot license per user)
  workIqConnectionId: process.env.WORKIQ_CONNECTION_ID,

  // Legacy Azure OpenAI — kept as fallback during migration
  azureOpenAIKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureOpenAIDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,

  // Flowcase (Atea Service Hub) API
  flowcaseBaseUrl: process.env.FLOWCASE_BASE_URL ?? "https://servicehub.atea.com/flowcase",
  flowcaseApiKey: process.env.FLOWCASE_API_KEY,

  // Public base URL the bot is reachable at
  botEndpoint: process.env.BOT_ENDPOINT ?? `http://localhost:${process.env.PORT ?? 3978}`,
};

export default config;
