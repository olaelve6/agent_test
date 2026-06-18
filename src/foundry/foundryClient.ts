import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import config from "../config";

let client: AIProjectClient | null = null;

/**
 * Returns a singleton AIProjectClient for the configured Foundry project.
 * Uses managed identity in production (UserAssignedMsi) or DefaultAzureCredential locally.
 */
export function getFoundryClient(): AIProjectClient {
  if (!client) {
    if (!config.foundryProjectEndpoint) {
      throw new Error(
        "FOUNDRY_PROJECT_ENDPOINT is not set. " +
        "Configure it in your environment variables."
      );
    }

    const credential = config.MicrosoftAppType === "UserAssignedMsi"
      ? new ManagedIdentityCredential({ clientId: config.MicrosoftAppId })
      : new DefaultAzureCredential();

    client = new AIProjectClient(config.foundryProjectEndpoint, credential);
  }
  return client;
}
