const config = {
  MicrosoftAppId: process.env.CLIENT_ID,
  MicrosoftAppType: process.env.BOT_TYPE,
  MicrosoftAppTenantId: process.env.TENANT_ID,
  MicrosoftAppPassword: process.env.CLIENT_SECRET,
  azureOpenAIKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureOpenAIDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,

  // Flowcase (Atea Service Hub) API
  // Base URL — typically https://servicehub.atea.com/flowcase
  flowcaseBaseUrl: process.env.FLOWCASE_BASE_URL ?? "https://servicehub.atea.com/flowcase",
  // Sent as the `Ocp-Apim-Subscription-Key` header (Azure API Management).
  flowcaseApiKey: process.env.FLOWCASE_API_KEY,

  // Public base URL the bot is reachable at — used to build download
  // links served from the bot's own HTTP server. Set by the dev-tunnel
  // task locally; populated from infra/manifest in remote envs.
  botEndpoint: process.env.BOT_ENDPOINT ?? `http://localhost:${process.env.PORT ?? 3978}`,
};

export default config;
