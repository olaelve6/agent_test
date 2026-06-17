import { CvEntries, Multilang } from "./getCvSchema";

/**
 * Build an Adaptive Card body that previews a CvEntries draft. Returns
 * an array of card elements (TextBlocks, Containers, FactSets) ready
 * to be embedded inside a parent card.
 *
 * Design goals:
 *   - At-a-glance: section headers + counts so the user can scan.
 *   - Compact: collapses long content; deep nesting goes into FactSets.
 *   - Multilang-aware: shows one language picked via {@link pickLang}.
 */
export function buildCvPreviewBody(
  entries: CvEntries,
  preferredLang: string = "no"
): any[] {
  const body: any[] = [];

  if (entries.key_qualifications?.length) {
    body.push(sectionHeader("Nøkkelkvalifikasjoner", entries.key_qualifications.length));
    for (const kq of entries.key_qualifications) {
      body.push({
        type: "Container",
        spacing: "Small",
        items: [
          {
            type: "TextBlock",
            text: pickLang(kq.label, preferredLang) ?? "(uten tittel)",
            weight: "Bolder",
            wrap: true
          },
          ...(kq.description
            ? [
                {
                  type: "TextBlock",
                  text: pickLang(kq.description, preferredLang),
                  wrap: true,
                  isSubtle: true,
                  spacing: "None"
                }
              ]
            : [])
        ]
      });
    }
  }

  if (entries.project_experiences?.length) {
    body.push(sectionHeader("Prosjekter", entries.project_experiences.length));
    for (const p of entries.project_experiences) {
      const subtitle = [
        pickLang(p.industry, preferredLang),
        formatDateRange(p.year_from, p.month_from, p.year_to, p.month_to)
      ]
        .filter(Boolean)
        .join(" • ");

      body.push({
        type: "Container",
        spacing: "Small",
        items: [
          {
            type: "TextBlock",
            text: pickLang(p.customer, preferredLang) ?? "(ukjent kunde)",
            weight: "Bolder",
            wrap: true
          },
          ...(subtitle
            ? [
                {
                  type: "TextBlock",
                  text: subtitle,
                  isSubtle: true,
                  size: "Small",
                  spacing: "None",
                  wrap: true
                }
              ]
            : []),
          ...(p.description
            ? [
                {
                  type: "TextBlock",
                  text: pickLang(p.description, preferredLang),
                  wrap: true
                }
              ]
            : []),
          ...(p.roles?.length
            ? [
                {
                  type: "TextBlock",
                  text: `**Rolle:** ${p.roles
                    .map((r) => pickLang(r.name, preferredLang))
                    .filter(Boolean)
                    .join(", ")}`,
                  wrap: true,
                  isSubtle: true,
                  size: "Small"
                }
              ]
            : []),
          ...(p.skills?.length
            ? [
                {
                  type: "TextBlock",
                  text: `**Teknologi:** ${p.skills
                    .map((s) => pickLang(s, preferredLang))
                    .filter(Boolean)
                    .join(", ")}`,
                  wrap: true,
                  isSubtle: true,
                  size: "Small"
                }
              ]
            : [])
        ]
      });
    }
  }

  if (entries.work_experiences?.length) {
    body.push(sectionHeader("Arbeidserfaring", entries.work_experiences.length));
    for (const w of entries.work_experiences) {
      body.push(
        simpleEntry({
          title: pickLang(w.employer, preferredLang),
          subtitle: formatDateRange(w.year_from, w.month_from, w.year_to, w.month_to),
          body: pickLang(w.description, preferredLang)
        })
      );
    }
  }

  if (entries.educations?.length) {
    body.push(sectionHeader("Utdanning", entries.educations.length));
    for (const e of entries.educations) {
      body.push(
        simpleEntry({
          title: pickLang(e.school, preferredLang),
          subtitle: [
            pickLang(e.degree, preferredLang),
            formatDateRange(e.year_from, e.month_from, e.year_to, e.month_to)
          ]
            .filter(Boolean)
            .join(" • ")
        })
      );
    }
  }

  if (entries.certifications?.length) {
    body.push(sectionHeader("Sertifiseringer", entries.certifications.length));
    for (const c of entries.certifications) {
      const dateParts = [c.year, c.year_expire ? `utløper ${c.year_expire}` : null]
        .filter(Boolean)
        .join(" • ");
      body.push(
        simpleEntry({
          title: pickLang(c.name, preferredLang),
          subtitle: [pickLang(c.organiser, preferredLang), dateParts]
            .filter(Boolean)
            .join(" • ")
        })
      );
    }
  }

  if (entries.courses?.length) {
    body.push(sectionHeader("Kurs", entries.courses.length));
    for (const c of entries.courses) {
      body.push(
        simpleEntry({
          title: pickLang(c.name, preferredLang),
          subtitle: c.year ?? undefined
        })
      );
    }
  }

  if (entries.languages?.length) {
    body.push(sectionHeader("Språk", entries.languages.length));
    body.push({
      type: "FactSet",
      facts: entries.languages.map((l) => ({
        title: pickLang(l.name, preferredLang) ?? "",
        value: pickLang(l.level, preferredLang) ?? ""
      }))
    });
  }

  if (entries.technologies?.length) {
    body.push(sectionHeader("Teknologi", entries.technologies.length));
    body.push({
      type: "FactSet",
      facts: entries.technologies.map((t) => ({
        title: pickLang(t.category, preferredLang) ?? "",
        value: (t.skills ?? [])
          .map((s) => pickLang(s, preferredLang))
          .filter(Boolean)
          .join(", ")
      }))
    });
  }

  if (body.length === 0) {
    body.push({
      type: "TextBlock",
      text: "_(Tomt utkast)_",
      isSubtle: true,
      wrap: true
    });
  }

  return body;
}

/** Section header with count badge. */
function sectionHeader(title: string, count: number) {
  return {
    type: "TextBlock",
    text: `${title} (${count})`,
    weight: "Bolder",
    size: "Medium",
    spacing: "Medium",
    separator: true
  };
}

/** A simple title / subtitle / optional body entry. */
function simpleEntry(opts: {
  title: string | undefined;
  subtitle?: string;
  body?: string;
}) {
  return {
    type: "Container",
    spacing: "Small",
    items: [
      {
        type: "TextBlock",
        text: opts.title ?? "(uten tittel)",
        weight: "Bolder",
        wrap: true
      },
      ...(opts.subtitle
        ? [
            {
              type: "TextBlock",
              text: opts.subtitle,
              isSubtle: true,
              size: "Small",
              spacing: "None",
              wrap: true
            }
          ]
        : []),
      ...(opts.body
        ? [{ type: "TextBlock", text: opts.body, wrap: true }]
        : [])
    ]
  };
}

/** Multilang → single string, biased to the user's language. */
function pickLang(value: Multilang | undefined, preferred: string): string | undefined {
  if (!value) return undefined;
  const order = [preferred, "no", "int", "en", "se", "dk"];
  for (const code of order) {
    const v = (value as Record<string, string | undefined>)[code];
    if (typeof v === "string" && v.trim()) return v;
  }
  for (const v of Object.values(value)) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/** "Jun 2024 – nå" style date range. Empty string if nothing useful. */
function formatDateRange(
  yearFrom?: string,
  monthFrom?: string,
  yearTo?: string,
  monthTo?: string
): string {
  const from = [monthFrom && monthName(monthFrom), yearFrom].filter(Boolean).join(" ");
  const to = [monthTo && monthName(monthTo), yearTo].filter(Boolean).join(" ");
  if (!from && !to) return "";
  if (from && !to) return `${from} – nå`;
  if (!from && to) return `– ${to}`;
  return `${from} – ${to}`;
}

const MONTHS_NO = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des"
];

function monthName(month: string): string {
  const n = parseInt(month, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return "";
  return MONTHS_NO[n - 1];
}
