/**
 * A *shortened*, human-friendly version of the Flowcase CV schema.
 *
 * Why a shortened version?
 *   The real Flowcase CV payload (see /cvs/{userId}/{cvId} in the OpenAPI
 *   spec) is huge: hundreds of fields, multilang objects ({ no, dk, int,
 *   se }), nested IDs, audit timestamps, order indexes, masterdata refs,
 *   attachments, etc. None of that is useful when a user is *dictating*
 *   new CV entries to the bot.
 *
 *   This file defines the minimal shape we want the model to fill in:
 *   just the things a user might naturally want to add to their CV.
 *
 * How it's used:
 *   - As the `parameters` schema on a tool the model calls (the JSON
 *     Schema below is already shaped for that — `type: "object"`,
 *     `properties`, `required` etc.).
 *   - As the payload format the bot serialises into a downloadable
 *     JSON file.
 *   - Later: as the input shape for a "push to Flowcase" tool that
 *     translates these entries into the full multilang Flowcase format.
 *
 * Design notes:
 *   - All free-text fields are single strings, not multilang objects.
 *     Pick the user's preferred language at write-time (e.g. "no").
 *   - Dates are split into year + optional month strings ("2024", "06")
 *     to match how Flowcase stores them. Leave month empty if unknown.
 *   - Every top-level array is optional so the model can add a single
 *     project without having to include empty `educations: []` etc.
 */

import type { JSONSchema7 } from "json-schema";

/**
 * Flowcase stores user-facing strings as multilang objects keyed by
 * language code: { no: "...", int: "...", dk: "...", se: "..." }.
 * At least one key should be present; "int" is the English fallback.
 */
export type Multilang = {
  no?: string;
  int?: string;
  dk?: string;
  se?: string;
};

/** Reusable JSON Schema fragment for a multilang string. */
const multilangString: JSONSchema7 = {
  type: "object",
  description:
    "Multilang string. Use the user's preferred language key (usually " +
    "'no' for Norwegian). Add 'int' as an English fallback when relevant. " +
    "At least one key must be set.",
  properties: {
    no: { type: "string", description: "Norwegian text." },
    int: { type: "string", description: "International / English text." },
    dk: { type: "string", description: "Danish text." },
    se: { type: "string", description: "Swedish text." }
  },
  minProperties: 1
};

/**
 * The TypeScript shape that matches the JSON Schema below.
 * Keep these two in sync.
 */
export type CvEntries = {
  /** Short bullet-point style summaries shown at the top of a CV. */
  key_qualifications?: Array<{
    /** Short label, e.g. "Cloud architecture". */
    label: Multilang;
    /** 1-3 sentence description. */
    description?: Multilang;
  }>;

  /** Customer / consulting project experiences. */
  project_experiences?: Array<{
    /** Customer name (or anonymised label if the project is sensitive). */
    customer: Multilang;
    /** Industry, e.g. "Public sector", "Banking". */
    industry?: Multilang;
    /** Short one-line description of the project. */
    description?: Multilang;
    /** Longer multi-sentence description of what the project was about. */
    long_description?: Multilang;
    /** Roles the user filled on the project. */
    roles?: Array<{
      /** Role name, e.g. "Tech lead". */
      name: Multilang;
      /** What the user actually did in that role. */
      description?: Multilang;
      /** Flag stating if this role has been customized or changed. */
      diverged_from_master?: boolean;
      /** Reference to Masterdata role UUID, null if custom or diverged. */
      cv_role_id?: string | null;
    }>;
    /** Skills / technologies used as multilang tags. */
    skills?: Multilang[];
    /** Start year as a 4-digit string, e.g. "2023". */
    year_from?: string;
    /** Start month as a 1-2 digit string, e.g. "6". */
    month_from?: string;
    /** End year as a 4-digit string. Omit if the project is ongoing. */
    year_to?: string;
    /** End month as a 1-2 digit string. Omit if ongoing. */
    month_to?: string;
  }>;

  /** Permanent employments / internal positions. */
  work_experiences?: Array<{
    employer: Multilang;
    /** Short description of the role / responsibilities. */
    description?: Multilang;
    year_from?: string;
    month_from?: string;
    year_to?: string;
    month_to?: string;
  }>;

  /** Schools, universities, degrees. */
  educations?: Array<{
    school: Multilang;
    /** Degree or programme name, e.g. "MSc Computer Science". */
    degree?: Multilang;
    year_from?: string;
    month_from?: string;
    year_to?: string;
    month_to?: string;
  }>;

  /** Professional certifications, e.g. "AZ-900". */
  certifications?: Array<{
    name: Multilang;
    /** Issuer, e.g. "Microsoft", "AWS". */
    organiser?: Multilang;
    /** Year obtained, 4-digit string. */
    year?: string;
    /** Month obtained, 1-2 digit string. */
    month?: string;
    /** Year the certification expires (if applicable). */
    year_expire?: string;
  }>;

  /** Shorter courses / training that don't warrant a full certification. */
  courses?: Array<{
    name: Multilang;
    year?: string;
    month?: string;
  }>;

  /** Spoken/written languages and proficiency. */
  languages?: Array<{
    /** Language name, e.g. "Norwegian", "English". */
    name: Multilang;
    /**
     * Proficiency level. Free-text but prefer one of:
     * "Native", "Fluent", "Professional", "Conversational", "Basic".
     */
    level?: Multilang;
  }>;

  /**
   * Skills grouped by category. Each group has a category name and a
   * list of multilang skill tags.
   */
  technologies?: Array<{
    /** Category name, e.g. "Cloud", "Programming languages". */
    category: Multilang;
    /** Individual skills, e.g. [{ no: "Azure" }, { no: "AWS" }]. */
    skills: Multilang[];
  }>;
};

/**
 * JSON Schema description of {@link CvEntries}.
 *
 * Plug this straight into a `Tool.parameters` field so the model fills
 * it in via a tool call. Also re-usable as the response/file format.
 */
export const cvEntriesSchema: JSONSchema7 = {
  type: "object",
  description:
    "A shortened CV payload the user is composing. Only include sections " +
    "the user has actually mentioned — leave the rest out entirely. Use " +
    "the user's preferred language for all free-text fields.",
  properties: {
    key_qualifications: {
      type: "array",
      description:
        "Short bullet-point summaries shown at the top of the CV.",
      items: {
        type: "object",
        properties: {
          label: multilangString,
          description: multilangString
        },
        required: ["label"]
      }
    },

    project_experiences: {
      type: "array",
      description:
        "Customer / consulting project experiences the user has worked on.",
      items: {
        type: "object",
        properties: {
          customer: multilangString,
          industry: multilangString,
          description: multilangString,
          long_description: multilangString,
          roles: {
            type: "array",
            description: "Roles the user filled on the project.",
            items: {
              type: "object",
              properties: {
                name: multilangString,
                description: multilangString,
                diverged_from_master: {
                  type: "boolean",
                  description: "True if the role deviates from masterdata."
                },
                cv_role_id: {
                  type: ["string", "null"],
                  description: "Flowcase CV role ID UUID, or null."
                }
              },
              required: ["name"]
            }
          },
          skills: {
            type: "array",
            description: "Skills / technologies used as multilang tags.",
            items: multilangString
          },
          year_from: {
            type: "string",
            description: "Start year as a 4-digit string, e.g. '2023'."
          },
          month_from: {
            type: "string",
            description: "Start month as a 1-2 digit string, e.g. '6'."
          },
          year_to: {
            type: "string",
            description: "End year. Omit if ongoing."
          },
          month_to: {
            type: "string",
            description: "End month. Omit if ongoing."
          }
        },
        required: ["customer"]
      }
    },

    work_experiences: {
      type: "array",
      description: "Permanent employments / internal positions.",
      items: {
        type: "object",
        properties: {
          employer: multilangString,
          description: multilangString,
          year_from: { type: "string" },
          month_from: { type: "string" },
          year_to: { type: "string" },
          month_to: { type: "string" }
        },
        required: ["employer"]
      }
    },

    educations: {
      type: "array",
      description: "Schools, universities, degrees.",
      items: {
        type: "object",
        properties: {
          school: multilangString,
          degree: multilangString,
          year_from: { type: "string" },
          month_from: { type: "string" },
          year_to: { type: "string" },
          month_to: { type: "string" }
        },
        required: ["school"]
      }
    },

    certifications: {
      type: "array",
      description: "Professional certifications, e.g. 'AZ-900'.",
      items: {
        type: "object",
        properties: {
          name: multilangString,
          organiser: multilangString,
          year: { type: "string", description: "Year obtained, 4-digit string." },
          month: { type: "string", description: "Month obtained, 1-2 digit." },
          year_expire: {
            type: "string",
            description: "Year the certification expires, if applicable."
          }
        },
        required: ["name"]
      }
    },

    courses: {
      type: "array",
      description:
        "Shorter courses / training that don't warrant a certification.",
      items: {
        type: "object",
        properties: {
          name: multilangString,
          year: { type: "string" },
          month: { type: "string" }
        },
        required: ["name"]
      }
    },

    languages: {
      type: "array",
      description: "Spoken/written languages and proficiency.",
      items: {
        type: "object",
        properties: {
          name: multilangString,
          level: multilangString
        },
        required: ["name"]
      }
    },

    technologies: {
      type: "array",
      description: "Skills grouped by category.",
      items: {
        type: "object",
        properties: {
          category: multilangString,
          skills: {
            type: "array",
            description:
              "Individual skills as multilang tags, e.g. [{ no: 'Azure' }].",
            items: multilangString
          }
        },
        required: ["category", "skills"]
      }
    }
  }
  // Note: no top-level `required` — the model should only include
  // sections the user has actually mentioned.
};

/**
 * Convenience accessor. A function (rather than the const directly) so
 * we have a natural extension point later — e.g. injecting the user's
 * preferred language into descriptions, or returning only a subset of
 * sections based on the caller's needs.
 */
export function getCvSchema(): JSONSchema7 {
  return cvEntriesSchema;
}
