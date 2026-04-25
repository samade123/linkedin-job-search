// src/types/index.ts

export interface Job {
  // ── Identity ────────────────────────────────────────────────────────────────
  id?:               string | number;
  position:          string;
  company:           string;
  companyLogo?:      string;
  location:          string;
  date:              string;
  agoTime:           string;
  salary?:           string;
  jobUrl:            string;

  // ── Board source ─────────────────────────────────────────────────────────────
  /** Which platform this job was fetched from. */
  boardType?:        "greenhouse" | "ashby" | "workable" | "linkedin";

  // ── Normalized description fields ────────────────────────────────────────────
  /**
   * Full decoded HTML from the board API.
   * Populated by normalizeJob(). Safe for v-html in the frontend.
   * - Greenhouse source: j.content
   * - Ashby source:      j.descriptionHtml
   */
  descriptionHtml?:  string;

  /**
   * Plain text with all HTML tags stripped.
   * Used as context in AI prompts (summarize, rate, etc.).
   */
  descriptionPlain?: string;

  /**
   * Alias of descriptionHtml.
   * Kept for backward compatibility — LinkedIn jobs and analysis
   * routes still read/write this field.
   */
  content?:          string;

  // ── AI enrichment ─────────────────────────────────────────────────────────────
  isVetted?:         boolean;
  score?:            number;
}

export interface QueryOptions {
  keyword: string;
  location: string;
  dateSincePosted: "24hr" | "past Week" | "past Month" | "";
  limit: string;
  jobType: "full time" | "part time" | "contract" | "temporary" | "volunteer" | "internship" | "";
  remoteFilter: "on site" | "remote" | "hybrid" | "";
  salary: "40000" | "60000" | "80000" | "100000" | "120000" | "";
  experienceLevel: "internship" | "entry level" | "associate" | "senior" | "director" | "executive" | "";
  sortBy: "recent" | "relevant";
  targetCountry?: string;
}

export interface SearchGoal {
  summary: string;
  titles: string[];
  relatedTitles: string[];
}
