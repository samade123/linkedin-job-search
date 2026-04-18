import axios from "axios";
import { Job, QueryOptions, SearchGoal } from "../types";
import { cleanJobText } from "../utils";
import { DEFAULT_AI_MODEL, DEFAULT_AI_BASE_URL } from "../config";

const BATCH_SIZE = 20;
const DEFAULT_BASE_URL = DEFAULT_AI_BASE_URL;
export { DEFAULT_AI_MODEL, DEFAULT_BASE_URL };

// ---------------------------------------------------------------------------
// Global AI request queue.
//
// The local model is single-threaded. Concurrent requests do not run in
// parallel — they interleave at the token level, producing garbage output
// from both callers. Every axios call to the AI endpoint must go through
// enqueue() so requests are serialised regardless of how many arrive
// concurrently from the Express server.
// ---------------------------------------------------------------------------
let _aiQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = _aiQueue.then(fn, fn);
  // Swallow rejections on the chain tail so a failed request does not
  // prevent subsequent requests from running.
  _aiQueue = next.then(
    () => {},
    () => {},
  );
  return next;
}

/**
 * Utility to strip markdown and extract JSON from AI responses reliably.
 */
function cleanJsonString(content: string): string {
  let text = content.trim();

  // 1. Try to extract from triple-backtick markdown blocks
  const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    text = markdownMatch[1].trim();
  }

  // 2. Find the start and end of the actual JSON structure
  const firstBracket = text.indexOf("[");
  const firstBrace = text.indexOf("{");

  let start = -1;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
  } else if (firstBrace !== -1) {
    start = firstBrace;
  }

  if (start !== -1) {
    const lastBracket = text.lastIndexOf("]");
    const lastBrace = text.lastIndexOf("}");
    const end = Math.max(lastBracket, lastBrace);

    if (end > start) {
      let cleaned = text.substring(start, end + 1).trim();

      // Heuristic fix for {"index": 123} pattern produced by some models
      // when asked to return a plain array of integers.
      if (cleaned.startsWith("[") && cleaned.includes('"index":')) {
        cleaned = cleaned.replace(/"index":\s*(\d+)/g, "\$1");
        cleaned = cleaned.replace(/\{\s*(\d+)\s*\}/g, "\$1");
      }

      // BUG 4 FIX — sanitize raw control characters that break JSON.parse
      // (bare newlines and tabs inside string values produce "Bad control
      //  character" errors; escape them before handing off to the parser).
      cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (c) => {
        if (c === "\n") return "\\n";
        if (c === "\t") return "\\t";
        if (c === "\r") return "\\r";
        return "";
      });

      return cleaned;
    }
  }

  return text;
}

/**
 * Executes an AI request and attempts to fix the JSON if parsing fails.
 * All HTTP calls are serialised through the global queue.
 */
async function callAiWithJsonRetry<T>(
  model: string,
  baseUrl: string,
  initialPayload: any,
  schemaDescription: string,
  isRetry: boolean = false,
): Promise<T | null> {
  try {
    const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const payloadWithModel = { ...initialPayload, model };

    const response = await enqueue(() =>
      axios.post(endpoint, payloadWithModel, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );

    if (response.status !== 200) return null;

    const content = response.data.choices[0].message.content.trim();
    console.log(`[AI] Response [${schemaDescription}]: ${content}`);
    const cleaned = cleanJsonString(content);
    console.log(`[CLEAN] Response [${schemaDescription}]: ${cleaned}`);

    try {
      return JSON.parse(cleaned) as T;
    } catch (parseError) {
      if (isRetry) {
        console.error(`[ERROR] AI failed to provide valid JSON even after retry: ${cleaned}`);
        return null;
      }

      console.warn(`[WARN] AI provided malformed JSON. Attempting self-correction for ${schemaDescription}...`);

      const retryPayload = {
        ...initialPayload,
        model,
        messages: [
          ...initialPayload.messages,
          { role: "assistant", content: content },
          {
            role: "user",
            content: `Your previous response was not valid JSON. Please fix it and return ONLY the valid ${schemaDescription}. Use double quotes for all strings. Do not use single quotes, asterisks, markdown, or backticks. Ensure all items are properly quoted and comma-separated.`,
          },
        ],
      };

      return callAiWithJsonRetry<T>(model, baseUrl, retryPayload, schemaDescription, true);
    }
  } catch (err: any) {
    console.error(`[ERROR] AI Request Error: ${err.message}`);
    return null;
  }
}

/**
 * Generates a structured JSON summary of what the user is looking for
 * based on their filters.
 */
export async function generateJobDescription(
  queryOptions: QueryOptions,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<SearchGoal> {
  const fallbackGoal: SearchGoal = {
    summary: `Searching for ${queryOptions.keyword}${queryOptions.location ? ` in ${queryOptions.location}` : ""}${queryOptions.jobType ? ` (${queryOptions.jobType})` : ""}${queryOptions.remoteFilter ? ` (${queryOptions.remoteFilter})` : ""}.`,
    titles: [queryOptions.keyword],
    relatedTitles: [],
  };

  try {
    const payload = {
      messages: [
        {
          role: "system",
          // BUG 8 FIX — concrete inline array examples replace vague
          // descriptions so the model cannot invent a wrapper object schema.
          content: `You are a universal professional job search strategist. Summarize the user's intent into a structured JSON response that serves any industry (Corporate, Healthcare, Education, Creative, etc.).

Strict JSON format — output ONLY this object, no markdown, no code fences:
{
  "summary": "A descriptive paragraph (2-3 sentences) summarizing the intent.",
  "titles": ["Web Developer", "Frontend Engineer", "Full Stack Engineer"],
  "relatedTitles": ["Software Engineer", "UI Developer", "React Developer", "JavaScript Engineer", "Backend Developer", "DevOps Engineer", "Systems Architect", "Mobile Developer"]
}

Rules:
1. "titles" must be a flat JSON array of plain strings — no objects, no nested keys, no single quotes.
2. "relatedTitles" must also be a flat JSON array of plain strings with at least 8 items.
3. Do NOT use markdown, asterisks, or bold inside any string value.
4. Implicit Openness: mention "open to all" for any missing/Any filters.
5. Professional Role Inference: if a specific tool or skill is provided, prioritise the corresponding professional role names.
6. Output ONLY the raw JSON object — no text before or after it.`,
        },
        {
          role: "user",
          content: `Translate these filters into a structured search goal:
- Keywords: ${queryOptions.keyword}
- Location: ${queryOptions.location || "Global"}
- Target Country: ${queryOptions.targetCountry || "Any"}
- Job Type: ${queryOptions.jobType || "Any"}
- Remote: ${queryOptions.remoteFilter || "Any"}
- Salary: ${queryOptions.salary || "Not specified"}
- Experience: ${queryOptions.experienceLevel || "Any"}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    };

    const parsed = await callAiWithJsonRetry<SearchGoal>(model, baseUrl, payload, "SearchGoal JSON object");

    // BUG 10 FIX — validate that titles is non-empty and summary is
    // substantive before accepting the result. An empty SearchGoal
    // causes Stage 1 regex to match nothing and silently falls back.
    if (
      parsed &&
      parsed.summary?.trim().length > 10 &&
      Array.isArray(parsed.titles) &&
      parsed.titles.length > 0 &&
      Array.isArray(parsed.relatedTitles)
    ) {
      return parsed;
    }
  } catch (error) {
    console.warn("Unexpected error in generateJobDescription:", error);
  }
  return fallbackGoal;
}

/**
 * Generates a structured JSON summary specifically tailored for Greenhouse
 * Job Boards.
 */
export async function generateGreenhouseJobGoal(
  keyword: string,
  targetCountry: string = "Any",
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_AI_BASE_URL,
): Promise<SearchGoal> {
  const fallbackGoal: SearchGoal = {
    summary: `Searching for ${keyword}${targetCountry ? ` in ${targetCountry}` : ""}.`,
    titles: [keyword],
    relatedTitles: [],
  };

  try {
    const payload = {
      messages: [
        {
          role: "system",
          // BUG 8 FIX — concrete inline array examples.
          content: `You are a specialist recruiter focusing on company-specific job boards (Greenhouse).
Summarize the user's intent for searching a SPECIFIC company's openings.

Strict JSON format — output ONLY this object, no markdown, no code fences:
{
  "summary": "A descriptive paragraph (2-3 sentences) summarizing the intent. Mention the specific company board and keyword.",
  "titles": ["Web Developer", "Frontend Engineer", "Full Stack Engineer"],
  "relatedTitles": ["Software Engineer", "UI Developer", "React Developer", "JavaScript Engineer", "Backend Developer", "DevOps Engineer", "Systems Architect", "Mobile Developer"]
}

Rules:
1. "titles" must be a flat JSON array of plain strings — no objects, no nested keys, no single quotes.
2. "relatedTitles" must also be a flat JSON array of plain strings with at least 8 items.
3. Do NOT use markdown, asterisks, or bold inside any string value.
4. Corporate Context: frame the summary as a targeted search within a single company's ecosystem.
5. Output ONLY the raw JSON object — no text before or after it.`,
        },
        {
          role: "user",
          content: `Generate a search goal for this Greenhouse board search:
- Target Keywords: ${keyword}
- Target Country: ${targetCountry}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    };

    const parsed = await callAiWithJsonRetry<SearchGoal>(model, baseUrl, payload, "Greenhouse SearchGoal JSON");

    // BUG 10 FIX — same non-empty validation as generateJobDescription.
    if (
      parsed &&
      parsed.summary?.trim().length > 10 &&
      Array.isArray(parsed.titles) &&
      parsed.titles.length > 0 &&
      Array.isArray(parsed.relatedTitles)
    ) {
      return parsed;
    }
  } catch (error) {
    console.warn("Unexpected error in generateGreenhouseJobGoal:", error);
  }
  return fallbackGoal;
}

/**
 * Filters jobs using AI in a multi-stage process:
 *   Stage 1 — Regex broad match
 *   Stage 2 — AI narrows to top 10
 *   Stage 3 — AI strict vetting
 */
export async function filterJobsWithAI(
  jobs: Job[],
  searchGoal: SearchGoal,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ filteredJobs: Job[]; errorMessage: string }> {
  let aiFilteredJobs: Job[] = [];
  let aiErrorMessage = "";

  console.log("Starting optimized AI filtering...");

  try {
    // -----------------------------------------------------------------------
    // Stage 1: Regex Broad Match
    // -----------------------------------------------------------------------
    console.log("Starting Stage 1: Regex Broad Match...");
    const allTerms = [...searchGoal.titles, ...searchGoal.relatedTitles]
      .flatMap((t) => t.split(/\s+/))
      .filter((t) => t.length > 2)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    if (allTerms.length === 0) {
      console.warn("No search terms found for regex filtering. Defaulting to first 50 jobs.");
      aiFilteredJobs = jobs.slice(0, 50).map((j) => ({ ...j, isVetted: false }));
    } else {
      const pattern = new RegExp(allTerms.join("|"), "i");
      const intermediateJobs = jobs.filter((job) => pattern.test(job.position) || pattern.test(job.company));

      console.log(`Stage 1 complete. Regex matched ${intermediateJobs.length} potential picks.`);

      // ---------------------------------------------------------------------
      // Stage 2: AI narrows to top 10
      // BUG 5 FIX — plain numbered lines replace JSON objects so the model
      //             cannot confuse the "index"/"company"/"location" field
      //             names from the input with the output schema.
      // BUG 4 FIX — max_tokens reduced to 80; an index array never needs
      //             more than ~30 tokens. 1550 gave the model space to
      //             hallucinate well past the closing bracket.
      // ---------------------------------------------------------------------
      if (intermediateJobs.length > 10) {
        console.log("Starting Stage 2: Final narrowing to top 10...");

        const jobListText = intermediateJobs
          .map((j, idx) => `${idx}. ${cleanJobText(j.position)} | ${cleanJobText(j.company)} | ${cleanJobText(j.location)}`)
          .join("\n");

        const finalPayload = {
          messages: [
            {
              role: "system",
              content: `You are a professional job selector. From the numbered list below, select the absolute top 10 best matches for the search goal.

Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}
Related Roles: ${searchGoal.relatedTitles.join(", ")}

Output ONLY a valid JSON array of the integer line numbers of your chosen jobs.
Do not include any explanation, markdown, or extra text.
Format: [0, 2, 9]`,
            },
            {
              role: "user",
              content: `Jobs:\n${jobListText}`,
            },
          ],
          temperature: 0.0,
          max_tokens: 80,
        };

        const finalIndices = await callAiWithJsonRetry<number[]>(model, baseUrl, finalPayload, "JSON array of 10 indices");

        // BUG 6 FIX — validate that the returned array is meaningfully
        // populated. Fewer than half the expected count is treated as a
        // soft failure and falls back to a deterministic slice.
        const EXPECTED_STAGE2_COUNT = 10;
        const validIndices = Array.isArray(finalIndices)
          ? finalIndices.filter((idx) => typeof idx === "number" && idx >= 0 && idx < intermediateJobs.length)
          : [];

        if (validIndices.length >= Math.ceil(EXPECTED_STAGE2_COUNT / 2)) {
          aiFilteredJobs = validIndices.map((idx) => ({
            ...intermediateJobs[idx],
            isVetted: false,
          }));
        } else {
          console.warn(
            `[WARN] Stage 2 returned ${validIndices.length} valid indices (expected ~${EXPECTED_STAGE2_COUNT}). Falling back to deterministic slice.`,
          );
          aiFilteredJobs = intermediateJobs.slice(0, EXPECTED_STAGE2_COUNT).map((j) => ({ ...j, isVetted: false }));
        }
      } else {
        aiFilteredJobs = intermediateJobs.map((j) => ({ ...j, isVetted: false }));
        console.log(`Total picks (${aiFilteredJobs.length}) is already <= 10. Skipping Stage 2.`);
      }

      // ---------------------------------------------------------------------
      // Stage 3: Strict Vetting
      // BUG 5 FIX — same plain-line format as Stage 2.
      // BUG 7 FIX — null result from callAiWithJsonRetry is now explicitly
      //             logged and surfaced to the client via aiErrorMessage.
      // ---------------------------------------------------------------------
      if (aiFilteredJobs.length > 0) {
        console.log("Starting Stage 3: Strict Vetting...");

        const vettingListText = aiFilteredJobs
          .map((j, idx) => `${idx}. ${cleanJobText(j.position)} | ${cleanJobText(j.company)} | ${cleanJobText(j.location)}`)
          .join("\n");

        const vettingPayload = {
          messages: [
            {
              role: "system",
              content: `You are a professional job auditor. From the numbered list below, output ONLY the line numbers of jobs that are GUARANTEED matches for the search goal.

Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}

Be extremely strict:
- The role, seniority, and core function must match the user's intent.
- Deduce the physical country from the location field. If it does not match the country mentioned in the Intent, reject it.
- If in doubt, reject.

Output ONLY a valid JSON array of the integer line numbers of guaranteed matches.
Do not include any explanation, markdown, or extra text.
Format: [1, 3]`,
            },
            {
              role: "user",
              content: `Jobs to vet:\n${vettingListText}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 80,
        };

        const vettedIndices = await callAiWithJsonRetry<number[]>(model, baseUrl, vettingPayload, "JSON array of vetted indices");

        if (Array.isArray(vettedIndices) && vettedIndices.length > 0) {
          const vettedSet = new Set(vettedIndices.map((idx) => Number(idx)));
          aiFilteredJobs.forEach((job, idx) => {
            job.isVetted = vettedSet.has(idx);
          });
        } else {
          // BUG 7 FIX — surface the vetting failure explicitly rather than
          // silently leaving all jobs with isVetted: false.
          console.warn("[WARN] Stage 3 vetting failed or returned an empty array. All results marked as unvetted.");
          aiErrorMessage = "Vetting stage failed — results are shown but have not been strictly vetted.";
        }
      }
    }
  } catch (err: any) {
    aiErrorMessage = `AI Filtering Error: ${err.message}`;
    console.error(`[ERROR] ${aiErrorMessage}`);
  }

  return { filteredJobs: aiFilteredJobs, errorMessage: aiErrorMessage };
}

/**
 * Rapidly optimizes a search keyword by expanding it into semantically
 * related professional terms.
 *
 * BUG 1 FIX — on exhausting all retries the function now throws so the
 * caller (server.ts warmup) can distinguish failure from success.
 */
export async function optimizeSearchKeywords(
  keyword: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const payload = {
    messages: [
      {
        role: "system",
        content:
          "Fix typos in the user's keyword and expand to 3-4 professional search terms across any relevant industry. Space-separated only. No extra text.",
      },
      {
        role: "user",
        content: `Keyword: ${keyword}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 64,
  };

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payloadWithModel = { ...payload, model };
  let lastError: any;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await enqueue(() =>
        axios.post(endpoint, payloadWithModel, {
          headers: { "Content-Type": "application/json" },
          timeout: 4500,
        }),
      );

      const content = response.data.choices[0]?.message?.content?.trim();
      if (content) {
        return content
          .replace(/^(Here are|Optimized:)\s+/i, "")
          .replace(/[,.]/g, " ")
          .replace(/\s\s+/g, " ")
          .trim();
      }
    } catch (err: any) {
      lastError = err;
      if (attempt < 2) {
        console.log(`[RETRY] Retrying Keyword Optimization (Attempt ${attempt + 1})...`);
      }
    }
  }

  // BUG 1 FIX — throw so the server warmup .catch() actually fires.
  console.warn(`[WARN] Keyword Optimization Failed after 2 attempts: ${lastError?.message}`);
  throw lastError ?? new Error("Keyword optimization failed");
}

// ---------------------------------------------------------------------------
// Simple in-memory cache for country normalization.
// ---------------------------------------------------------------------------
const countryCache: Record<string, string> = {};

// Per-key in-flight promise deduplication — prevents duplicate AI calls
// when two requests normalize the same country simultaneously.
const countryInflight: Record<string, Promise<string>> = {};

/**
 * Normalizes a country name using AI to ensure formal spelling and
 * formatting.
 *
 * BUG 9 FIX — result is validated for plausibility before being cached.
 * An implausible result (JSON fragment, single character, punctuation) is
 * discarded and the original input is returned without caching.
 */
export async function normalizeCountry(
  country: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const safeCountry = String(country || "").trim();
  if (!safeCountry || safeCountry.toLowerCase() === "global" || safeCountry.toLowerCase() === "any") {
    return "Global";
  }

  if (countryCache[safeCountry]) {
    console.log(`[NORM] AI Normalization Cache Hit: "${safeCountry}" -> "${countryCache[safeCountry]}"`);
    return countryCache[safeCountry];
  }

  if (countryInflight[safeCountry] !== undefined) {
    console.log(`[NORM] Deduplicating in-flight request for "${safeCountry}"`);
    return countryInflight[safeCountry];
  }

  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const safeModel = String(model || DEFAULT_AI_MODEL);

  console.log(`[NORM] AI Normalizing: "${safeCountry}" | Model: ${safeModel} | API: ${endpoint}`);

  const requestPayload = {
    messages: [
      {
        role: "system",
        content: "Return ONLY the formal English name of the country provided. No commentary.",
      },
      {
        role: "user",
        content: safeCountry,
      },
    ],
    temperature: 0,
    max_tokens: 20,
    model: safeModel,
  };

  const promise = enqueue(() =>
    axios.post(endpoint, requestPayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 8000,
    }),
  )
    .then((response) => {
      const content = response.data.choices[0]?.message?.content?.trim();
      if (content) {
        const formalized = content.replace(/^["']|["']$|\.$/g, "").trim();

        // BUG 9 FIX — basic plausibility check before caching.
        // A valid country name contains only letters, spaces, hyphens,
        // apostrophes, and periods. JSON punctuation or very short/long
        // strings indicate the model returned something other than a
        // country name.
        const isPlausible = formalized.length > 1 && formalized.length < 60 && /^[a-zA-Z\s\-'.]+$/.test(formalized);

        if (isPlausible) {
          countryCache[safeCountry] = formalized;
          console.log(`[NORM] AI Normalization result: "${safeCountry}" -> "${formalized}"`);
          return formalized;
        } else {
          console.warn(`[NORM] Implausible normalization result discarded: "${formalized}". Returning original input.`);
          return safeCountry;
        }
      }
      return safeCountry;
    })
    .catch((err: any) => {
      console.error(`[WARN] Country Normalization Failed: ${err.message} (URL: ${endpoint})`);
      return safeCountry;
    })
    .finally(() => {
      delete countryInflight[safeCountry];
    });

  countryInflight[safeCountry] = promise;
  return promise;
}

/**
 * Extracts key functional sections from a job description and thins out
 * boilerplate.
 */
function thinJobContent(text: string): string {
  if (!text) return "";

  let clean = cleanJobText(text);

  const patterns = [
    /responsibilit\w+/i,
    /requirement\w+/i,
    /qualification\w+/i,
    /skills?/i,
    /about the role/i,
    /what you\w+ do/i,
    /what we\w+ looking for/i,
  ];

  let matches: string[] = [];
  patterns.forEach((p) => {
    const match = clean.match(new RegExp(`${p.source}[\\s\\S]{1,1500}`, "i"));
    if (match) matches.push(match[0]);
  });

  if (matches.length === 0) {
    return clean.substring(0, 3000);
  }

  return matches.join("\n\n---\n\n").substring(0, 4000);
}

/**
 * Summarizes a full job description into a concise 2-3 sentence overview.
 */
export async function summarizeJobRole(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Summarizing Role... (Model: ${safeModel}, Length: ${safeDescription.length})`);

  const payload = {
    model: safeModel,
    messages: [
      {
        role: "system",
        content:
          "You are an expert technical recruiter. Summarize the provided job description into a high-impact, professional summary of exactly 2-3 sentences focusing on primary responsibilities. No fluff.",
      },
      {
        role: "user",
        content: `Job Description: ${safeDescription}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 250,
  };

  try {
    const response = await enqueue(() =>
      axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );
    const result = response.data.choices?.[0]?.message?.content?.trim();
    return result || "Summary unavailable.";
  } catch (err: any) {
    console.error(`[WARN] Summarization Failed: ${err.message} (URL: ${endpoint})`);
    return "Failed to generate summary.";
  }
}

/**
 * Evaluates a job description against a search goal to provide a
 * compatibility score and targeted reasons.
 *
 * BUG 3 FIX — replaced bare JSON.parse with callAiWithJsonRetry so
 * malformed responses get one self-correction attempt before failing.
 */
export async function rateJobCompatibility(
  description: string,
  searchGoal: SearchGoal,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ score: number; reasons: string[] }> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Rating Compatibility... (Model: ${safeModel}, Length: ${safeDescription.length})`);

  const payload = {
    messages: [
      {
        role: "system",
        content: `Compare the job description with the user's search intent. Output ONLY a valid JSON object. Do not use markdown, asterisks, or single quotes.

Intent: "${searchGoal.summary}"

Format:
{
  "score": 85,
  "reasons": ["Reason one", "Reason two", "Reason three"]
}`,
      },
      {
        role: "user",
        content: `Job Description: ${safeDescription}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 250,
  };

  const parsed = await callAiWithJsonRetry<{ score: number; reasons: string[] }>(
    safeModel,
    safeBaseUrl,
    payload,
    "Compatibility Rating JSON",
  );

  if (parsed) {
    return {
      score: typeof parsed.score === "number" ? parsed.score : 0,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ["Analysis inconclusive."],
    };
  }

  console.error(`[WARN] Compatibility Rating Failed after retry.`);
  return { score: 0, reasons: ["Failed to calculate compatibility."] };
}

/**
 * Extracts benefits and company culture insights from a job description.
 */
export async function analyzeJobCultureAndBenefits(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Analyzing Culture & Benefits... (Model: ${safeModel})`);

  const payload = {
    model: safeModel,
    messages: [
      {
        role: "system",
        content:
          "You are a workplace culture analyst. Identify the benefits (perks, flexible work, etc.) and the company culture mentioned or implied in the job description. 2-3 sentences only. Plain text — no markdown, no asterisks, no bold.",
      },
      {
        role: "user",
        content: `Job Description: ${safeDescription}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 300,
  };

  try {
    const response = await enqueue(() =>
      axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );
    return response.data.choices?.[0]?.message?.content?.trim() || "Culture/Benefits data unavailable.";
  } catch (err: any) {
    console.error(`[WARN] Culture/Benefits Analysis Failed: ${err.message}`);
    return "Failed to analyze culture and benefits.";
  }
}

/**
 * Provides a strategic Pros & Cons breakdown of a job role.
 *
 * BUG 2 FIX — removed "Use **bold**" instruction from the prompt. The
 *             model was inserting markdown asterisks inside JSON string
 *             values, breaking JSON.parse with "Unexpected token '*'".
 * BUG 3 FIX — replaced bare JSON.parse with callAiWithJsonRetry.
 */
export async function analyzeJobProsAndCons(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ pros: string[]; cons: string[] }> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Analyzing Pros & Cons... (Model: ${safeModel})`);

  const payload = {
    messages: [
      {
        role: "system",
        // BUG 2 FIX — no markdown instruction, concrete value examples,
        // explicit prohibition on asterisks and single quotes.
        content: `Identify strategic Pros and Cons for this role. Output ONLY a valid JSON object.
Do not use markdown, asterisks, bold, or single quotes inside any string value.

Format:
{
  "pros": ["Competitive salary and equity package", "Strong remote-first culture"],
  "cons": ["Fast-paced environment may suit experienced candidates only", "On-call rotation required"]
}`,
      },
      {
        role: "user",
        content: `Job Description: ${safeDescription}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 250,
  };

  const parsed = await callAiWithJsonRetry<{ pros: string[]; cons: string[] }>(safeModel, safeBaseUrl, payload, "Pros and Cons JSON");

  if (parsed) {
    return {
      pros: Array.isArray(parsed.pros) ? parsed.pros : ["Analysis inconclusive."],
      cons: Array.isArray(parsed.cons) ? parsed.cons : ["Analysis inconclusive."],
    };
  }

  console.error(`[WARN] Pros/Cons Analysis Failed after retry.`);
  return { pros: ["Failed to analyze pros."], cons: ["Failed to analyze cons."] };
}

/**
 * Extracts significant direct quotes from a job description.
 *
 * BUG 3 FIX — replaced bare JSON.parse with callAiWithJsonRetry.
 */
export async function extractJobQuotes(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string[]> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Extracting Key Quotes... (Model: ${safeModel})`);

  const payload = {
    messages: [
      {
        role: "system",
        content: `Identify the 3 most significant direct quotes from the job description that characterize the role's essence, seniority, or unique challenges.
Return ONLY a valid JSON array of strings. Do not use single quotes. Do not include any text outside the JSON array.

Example: ["We move fast and value ownership.", "You will lead a team of 8 engineers.", "On-call is shared equally across the team."]`,
      },
      {
        role: "user",
        content: `Job Description: ${safeDescription}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 250,
  };

  const parsed = await callAiWithJsonRetry<string[]>(safeModel, safeBaseUrl, payload, "Key Quotes JSON array");

  if (Array.isArray(parsed)) return parsed;

  console.error(`[WARN] Quotes Extraction Failed after retry.`);
  return ["Failed to extract quotes."];
}

/**
 * Runs a performance diagnostic on the AI model.
 */
export async function runAiDiagnostics(
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{
  totalAttempts: number;
  latencies: number[];
  healthSummary: string;
  status: "optimal" | "degraded" | "offline";
}> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const latencies: number[] = [];
  let totalAttempts = 0;
  let successResponse = "";

  console.log(`[AI] Starting Diagnostics Pulse for ${model}...`);

  for (let i = 1; i <= 5; i++) {
    totalAttempts = i;
    const start = Date.now();
    try {
      const response = await enqueue(() =>
        axios.post(
          endpoint,
          {
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
            temperature: 0,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 8000,
          },
        ),
      );

      if (response.status === 200) {
        latencies.push(Date.now() - start);
        successResponse = response.data.choices?.[0]?.message?.content || "pong";
        break;
      }
    } catch (err: any) {
      console.warn(`[AI] Probe Attempt ${i} failed: ${err.message}`);
      latencies.push(-1);
      if (i === 5) {
        return {
          totalAttempts,
          latencies,
          healthSummary: "Connection timed out after 5 attempts.",
          status: "offline",
        };
      }
    }
  }

  try {
    const validLatencies = latencies.filter((l) => l > 0);
    const avgLatency = validLatencies.length ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) : 0;

    const summaryPayload = {
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a system health agent. Analyze the provided latency data and attempt count. Summarize the model's performance in one professional sentence. No fluff.",
        },
        {
          role: "user",
          content: `Inference Probe Stats: Attempts: ${totalAttempts}, Avg Latency: ${avgLatency}ms. Status: Success at attempt ${totalAttempts}.`,
        },
      ],
      max_tokens: 100,
      temperature: 0.2,
    };

    const summaryRes = await enqueue(() =>
      axios.post(endpoint, summaryPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }),
    );

    const healthSummary = summaryRes.data.choices?.[0]?.message?.content?.trim() || "Analysis unavailable.";

    return {
      totalAttempts,
      latencies,
      healthSummary,
      status: avgLatency < 1500 ? "optimal" : "degraded",
    };
  } catch (err: any) {
    return {
      totalAttempts,
      latencies,
      healthSummary: "Probe succeeded but self-diagnostic summary failed.",
      status: "degraded",
    };
  }
}
