import { findUser } from "../tools/flowcase/flowcaseClient";
import { FlowcaseUser } from "../tools/flowcase/types";

/**
 * Auto-loaded "current user" context.
 *
 * This bypasses the LLM tool-calling loop entirely: the user's Flowcase
 * profile is fetched server-side and injected into the system prompt, so
 * the model always knows who it's talking to without having to decide to
 * call a function.
 */

// TODO: derive from `activity.from` (e.g. aadObjectId -> email via Graph)
// once we wire real Teams identity through.
const HARDCODED_USER_EMAIL = "ola.johannes.elvedahl@atea.no";

export type UserContext = {
  name?: string;
  email?: string;
  role?: string;
  office_name?: string;
  country_code?: string;
  language_code?: string;
  default_cv_id?: string;
  company_name?: string;
};

/**
 * Resolve the current user's Flowcase profile.
 * Returns null on any error so the agent keeps working even if Flowcase
 * is down or the key is wrong.
 */
export async function loadUserContext(): Promise<UserContext | null> {
  try {
    const result = await findUser({ email: HARDCODED_USER_EMAIL });
    if (!result) return null;
    const user: FlowcaseUser = Array.isArray(result) ? result[0] : result;
    return {
      name: user.name,
      email: user.email,
      role: user.role,
      office_name: user.office_name,
      country_code: user.country_code,
      language_code: user.language_code,
      default_cv_id: user.default_cv_id,
      company_name: user.company_name
    };
  } catch (err) {
    console.error("[userContext] Flowcase lookup failed:", err);
    return null;
  }
}

/**
 * Render the user context as a markdown block that can be appended to
 * the system prompt.
 */
export function formatUserContext(ctx: UserContext): string {
  const lines: string[] = ["## Current user (from Flowcase)"];
  if (ctx.name) lines.push(`- Name: ${ctx.name}`);
  if (ctx.email) lines.push(`- Email: ${ctx.email}`);
  if (ctx.role) lines.push(`- Role: ${ctx.role}`);
  if (ctx.office_name) lines.push(`- Office: ${ctx.office_name}`);
  if (ctx.country_code) lines.push(`- Country: ${ctx.country_code}`);
  if (ctx.language_code) lines.push(`- Preferred language: ${ctx.language_code}`);
  if (ctx.company_name) lines.push(`- Company: ${ctx.company_name}`);
  return lines.join("\n");
}
