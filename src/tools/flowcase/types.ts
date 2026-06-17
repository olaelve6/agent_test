/**
 * Minimal subset of the Flowcase "Users" response shape — only the fields
 * we actually surface in chat. The API returns many more fields; see the
 * OpenAPI spec for the full schema.
 */
export type FlowcaseUser = {
  user_id?: string;
  _id?: string;
  id?: string;
  company_id?: string;
  company_name?: string;
  email?: string;
  external_unique_id?: string;
  name?: string;
  telephone?: string;
  role?: string;
  roles?: string[];
  office_id?: string;
  office_name?: string;
  country_id?: string;
  country_code?: string;
  language_code?: string;
  deactivated?: boolean;
  created_at?: string;
  updated_at?: string;
  default_cv_id?: string;
  default_cv_template_id?: string;
};

export type FindUserQuery = {
  /** Email of the user to look up. */
  email?: string;
  /** Atea domain user-name. */
  external_unique_id?: string;
};

/**
 * A Flowcase multilang value, e.g. { no: "Tittel", int: "Title" }.
 * Country codes vary; treat any string-valued key as a candidate.
 */
export type FlowcaseMultilang = Record<string, string | undefined>;

/**
 * Loose shape of the Flowcase CV response. The real payload is huge and
 * deeply nested — we only declare the top-level arrays we care about and
 * keep each entry as `Record<string, any>`. The tool layer normalises
 * what it actually sends to the model.
 */
export type FlowcaseCv = {
  _id?: string;
  user_id?: string;
  name?: string;
  email?: string;
  title?: FlowcaseMultilang | string;
  language_code?: string;
  language_codes?: string[];
  country_code?: string;
  key_qualifications?: Array<Record<string, any>>;
  project_experiences?: Array<Record<string, any>>;
  work_experiences?: Array<Record<string, any>>;
  educations?: Array<Record<string, any>>;
  certifications?: Array<Record<string, any>>;
  courses?: Array<Record<string, any>>;
  languages?: Array<Record<string, any>>;
  technologies?: Array<Record<string, any>>;
  updated_at?: string;
  [extra: string]: any;
};
