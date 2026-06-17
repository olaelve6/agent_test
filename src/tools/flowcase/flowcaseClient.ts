import config from "../../config";
import { FindUserQuery, FlowcaseCv, FlowcaseUser } from "./types";

/**
 * Thin wrapper around the Flowcase HTTP API.
 *
 * Env vars:
 *   - FLOWCASE_BASE_URL  (optional) defaults to https://servicehub.atea.com/flowcase
 *   - FLOWCASE_API_KEY   required, sent as the `Ocp-Apim-Subscription-Key` header
 */

function requireConfig() {
  if (!config.flowcaseApiKey) {
    throw new Error(
      "FLOWCASE_API_KEY is not set. Add it to your env (e.g. .localConfigs)."
    );
  }
  return {
    baseUrl: (config.flowcaseBaseUrl ?? "").replace(/\/+$/, ""),
    apiKey: config.flowcaseApiKey
  };
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Ocp-Apim-Subscription-Key": apiKey
  };
}

/** Mask all but the first 4 and last 4 chars of a secret for safe logging. */
function maskSecret(value: string | undefined): string {
  if (!value) return "(missing)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

/**
 * GET {base}/users/find?email=...&external_unique_id=...
 * Returns the parsed user object, or null on 404.
 */
export async function findUser(
  query: FindUserQuery
): Promise<FlowcaseUser | FlowcaseUser[] | null> {
  if (!query.email && !query.external_unique_id) {
    throw new Error(
      "findUser requires either `email` or `external_unique_id`."
    );
  }

  const { baseUrl, apiKey } = requireConfig();
  const url = new URL(`${baseUrl}/users/find`);
  if (query.email) url.searchParams.set("email", query.email);
  if (query.external_unique_id) {
    url.searchParams.set("external_unique_id", query.external_unique_id);
  }

  const headers = buildHeaders(apiKey);

  if (process.env.FLOWCASE_DEBUG === "1") {
    console.log("[flowcase] GET", url.toString());
    console.log("[flowcase] headers:", {
      ...headers,
      "Ocp-Apim-Subscription-Key": maskSecret(headers["Ocp-Apim-Subscription-Key"])
    });
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Flowcase /users/find failed: ${response.status} ${response.statusText}` +
        (body ? ` — ${body.slice(0, 500)}` : "")
    );
  }

  return (await response.json()) as FlowcaseUser | FlowcaseUser[];
}

/**
 * GET {base}/cvs/{userId}/{cvId}
 * Returns the parsed CV object, or null on 404.
 */
export async function getCv(
  userId: string,
  cvId: string
): Promise<FlowcaseCv | null> {
  if (!userId || !cvId) {
    throw new Error("getCv requires both userId and cvId.");
  }

  const { baseUrl, apiKey } = requireConfig();
  const url = `${baseUrl}/cvs/${encodeURIComponent(userId)}/${encodeURIComponent(cvId)}`;

  const headers = buildHeaders(apiKey);

  if (process.env.FLOWCASE_DEBUG === "1") {
    console.log("[flowcase] GET", url);
    console.log("[flowcase] headers:", {
      ...headers,
      "Ocp-Apim-Subscription-Key": maskSecret(headers["Ocp-Apim-Subscription-Key"])
    });
  }

  const response = await fetch(url, { method: "GET", headers });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Flowcase /cvs/{userId}/{cvId} failed: ${response.status} ${response.statusText}` +
        (body ? ` \u2014 ${body.slice(0, 500)}` : "")
    );
  }

  return (await response.json()) as FlowcaseCv;
}
