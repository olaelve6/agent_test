import Ajv from "ajv"; // 1. Import Ajv
import config from "../../config";
import { Tool, ToolParameters } from "../types";
import { putFile } from "../fileDownload/fileStore";
import { CvEntries, cvEntriesSchema } from "./getCvSchema";
import { buildCvPreviewBody } from "./cvPreview";

// 2. Initialize Ajv and compile the CV Schema once on startup
// we set strict: false since some JSONSchema properties (like custom descriptions) can trigger warnings.
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(cvEntriesSchema);

/**
 * Tool: takes CV entries the user has dictated to the bot, packages
 * them as a JSON file matching our shortened CV schema, and returns a
 * download link.
 *
 * The model is responsible for filling in the schema based on the
 * conversation — this tool just persists what it's given and serves it.
 */
export const createCvFileTool: Tool = {
  name: "createCvFile",

  description:
    "Package the user's CV entries as a downloadable JSON file. Call " +
    "this AFTER the user has supplied CV content (projects, skills, " +
    "education, certifications, languages, etc.) and asks for it as a " +
    "file, or when you have collected enough to produce a meaningful " +
    "draft. Only include sections the user has actually mentioned — " +
    "do not invent or pad with content the user did not provide.\n\n" +
    "Use the user's preferred language for all free-text fields.\n\n" +
    "DESCRIPTION QUALITY: If the user is terse (e.g. just gives a " +
    "customer name, role title, or course name), you SHOULD flesh out " +
    "the `description` / `long_description` / `description` fields with " +
    "a plausible, professional 1-3 sentence elaboration based on what " +
    "you reasonably know about that role, technology, project type, or " +
    "subject. This is acceptable padding because it stays within the " +
    "topic the user introduced — do NOT invent new projects, " +
    "employers, certifications, or skills the user never mentioned. " +
    "When in doubt, prefer a generic-but-realistic description over " +
    "leaving the field empty. The user can edit the draft afterwards.",

  parameters: cvEntriesSchema as unknown as ToolParameters,

  async execute(input: CvEntries) {
    // 3. Validate incoming parameters before storing the file
    const valid = validate(input);

    if (!valid) {
      console.warn("[createCvFile] Validation failed:", validate.errors);

      // Return a diagnostic error. Since 'type' is NOT "fileDownload",
      // app.ts will bypass rendering a download card.
      // Instead, the raw validation failure is passed back to the model's chat log.
      // The model will read this, learn from it, and attempt to correct its arguments.
      return {
        type: "validationError",
        message: "The generated CV did not comply with the JSON Draft schema. Please fix these fields:",
        errors: validate.errors?.map(err => ({
          path: err.instancePath || "(root)",
          message: err.message,
          params: err.params
        }))
      };
    }

    // --- Validation passed! Proceed to generate file ---

    const payload = {
      ...input,
      generatedAt: new Date().toISOString()
    };

    const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    const filename = "cv-draft.json";

    const id = putFile({
      filename,
      contentType: "application/json",
      body
    });

    const baseUrl = config.botEndpoint?.replace(/\/$/, "") ?? "";
    const downloadUrl = `${baseUrl}/download/${id}`;

    // Quick section overview so the card / model reply can confirm
    // what's actually in the file without dumping everything.
    const sectionCounts = summarizeSections(input);

    // Build an Adaptive Card preview body so the user can see what's
    // in the file before downloading.
    const previewBody = buildCvPreviewBody(input);

    return {
      type: "fileDownload",
      filename,
      downloadUrl,
      cardDescription:
        "Forhåndsvisning under. Klikk på knappen for å " +
        "laste ned hele CV-utkastet som JSON-fil.",
      description:
        "A CV draft has been packaged as a JSON file and a download " +
        "card (with an inline preview) has been rendered. Briefly " +
        "confirm to the user which sections were included (see " +
        "`sectionCounts`) and point them to the download button. " +
        "Do NOT repeat every entry — the card preview and the " +
        "file already contain them.",
      sectionCounts,
      previewBody
    };
  }
};

/**
 * Build a `{ section: count }` map for the sections the user actually
 * supplied. Used by the model to write a short "here's what's in your
 * draft" confirmation without re-listing every entry.
 */
function summarizeSections(entries: CvEntries): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value) && value.length > 0) {
      counts[key] = value.length;
    }
  }
  return counts;
}