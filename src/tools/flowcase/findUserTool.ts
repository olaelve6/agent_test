import { Tool } from "../types";
import { findUser, getCv } from "./flowcaseClient";
import { FlowcaseCv, FlowcaseMultilang, FlowcaseUser } from "./types";

/**
 * Pick a single string out of a Flowcase multilang object, preferring
 * the user's language. Falls back through a sensible priority list.
 */
function pickLang(
  value: FlowcaseMultilang | string | undefined,
  preferred?: string
): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value || undefined;
  const order = [preferred, "no", "se", "dk", "int", "en"].filter(Boolean) as string[];
  for (const code of order) {
    const v = value[code];
    if (typeof v === "string" && v.trim()) return v;
  }
  for (const v of Object.values(value)) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/**
 * Fetch the CV for a Flowcase user. Returns null when the user has no
 * default CV or the API returns 404. Errors from the API propagate.
 */
export async function fetchCvForUser(
  user: FlowcaseUser
): Promise<FlowcaseCv | null> {
  const userId = user.user_id ?? user._id ?? user.id;
  const cvId = user.default_cv_id;
  if (!userId || !cvId) return null;
  return getCv(userId, cvId);
}

/**
 * Collapse the giant CV payload into a compact, model-friendly summary.
 * Keep the highest-signal sections; drop IDs, timestamps, attachments,
 * and the multilang nesting.
 */
export function summarizeCv(cv: FlowcaseCv, preferredLang?: string) {
  const lang = preferredLang ?? cv.language_code;

  return {
    title: pickLang(cv.title, lang),
    updated_at: cv.updated_at,

    key_qualifications: (cv.key_qualifications ?? [])
      .filter((kq) => !kq.disabled)
      .map((kq) => ({
        label: pickLang(kq.label, lang),
        description:
          pickLang(kq.long_description, lang) ?? pickLang(kq.tag_line, lang)
      })),

    project_experiences: (cv.project_experiences ?? [])
      .filter((p) => !p.disabled)
      .map((p) => ({
        customer: pickLang(p.customer, lang),
        industry: pickLang(p.industry, lang),
        description: pickLang(p.description, lang),
        long_description: pickLang(p.long_description, lang),
        from: [p.year_from, p.month_from].filter(Boolean).join("-") || undefined,
        to: [p.year_to, p.month_to].filter(Boolean).join("-") || undefined,
        roles: (p.roles ?? [])
          .filter((r: any) => !r.disabled)
          .map(
            (r: any) =>
              pickLang(r.long_description, lang) ?? pickLang(r.summary, lang)
          )
          .filter(Boolean)
      })),

    work_experiences: (cv.work_experiences ?? [])
      .filter((w) => !w.disabled)
      .map((w) => ({
        employer: pickLang(w.employer, lang),
        description: pickLang(w.description, lang),
        from: [w.year_from, w.month_from].filter(Boolean).join("-") || undefined
      })),

    educations: (cv.educations ?? [])
      .filter((e) => !e.disabled)
      .map((e) => ({
        school: pickLang(e.school, lang),
        degree: pickLang(e.degree, lang),
        from: [e.year_from, e.month_from].filter(Boolean).join("-") || undefined,
        to: [e.year_to, e.month_to].filter(Boolean).join("-") || undefined
      })),

    certifications: (cv.certifications ?? [])
      .filter((c) => !c.disabled)
      .map((c) => ({
        name: pickLang(c.name, lang),
        organiser: pickLang(c.organiser, lang),
        year: c.year,
        year_expire: c.year_expire
      })),

    courses: (cv.courses ?? [])
      .filter((c) => !c.disabled)
      .map((c) => ({
        name: pickLang(c.name, lang),
        year: c.year
      })),

    languages: (cv.languages ?? [])
      .filter((l) => !l.disabled)
      .map((l) => ({
        name: pickLang(l.name, lang),
        level: pickLang(l.level, lang)
      })),

    technologies: (cv.technologies ?? [])
      .filter((t) => !t.disabled)
      .map((t) => ({
        category: pickLang(t.category, lang),
        skills: (t.technology_skills ?? [])
          .map((s: any) => pickLang(s.tags, lang))
          .filter(Boolean)
      }))
  };
}

export const findFlowcaseUserTool: Tool = {
  name: "findFlowcaseUser",

  description:
    "Find an Atea employee in Flowcase by their email address or ATEA " +
    "domain user-name. Returns profile info AND a summary of their CV " +
    "(key qualifications, project experience, work history, education, " +
    "certifications, skills). Use this when the user asks about *another* " +
    "person (not themselves \u2014 the current user's profile is already " +
    "in the system prompt).",

  parameters: {
    type: "object",
    properties: {
      email: {
        type: "string",
        description:
          "The user's email address (e.g. jane.doe@atea.no). " +
          "Provide this OR external_unique_id."
      },
      external_unique_id: {
        type: "string",
        description:
          "The user's ATEA domain user-name. Provide this OR email."
      }
    }
    // Intentionally no `required`: exactly one of the two must be set,
    // enforced at runtime in the client.
  },

  async execute(input: { email?: string; external_unique_id?: string }) {
    const result = await findUser({
      email: input.email,
      external_unique_id: input.external_unique_id
    });

    if (result === null) {
      return { type: "flowcaseUser", found: false };
    }

    const user: FlowcaseUser = Array.isArray(result) ? result[0] : result;

    // Fetch the CV in a second call. Don't fail the whole tool if the
    // CV lookup errors — the profile alone is still useful.
    let cvSummary: ReturnType<typeof summarizeCv> | null = null;
    try {
      const cv = await fetchCvForUser(user);
      if (cv) cvSummary = summarizeCv(cv, user.language_code);
    } catch (err) {
      console.error("[findFlowcaseUser] CV fetch failed:", err);
    }

    return {
      type: "flowcaseUser",
      found: true,
      user: {
        id: user.user_id ?? user._id ?? user.id,
        name: user.name,
        email: user.email,
        external_unique_id: user.external_unique_id,
        role: user.role,
        roles: user.roles,
        office_name: user.office_name,
        country_code: user.country_code,
        language_code: user.language_code,
        telephone: user.telephone,
        deactivated: user.deactivated,
        default_cv_id: user.default_cv_id,
        company_name: user.company_name
      },
      cv: cvSummary
    };
  }
};