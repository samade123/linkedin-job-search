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

      // Heuristic fix for "index": 123 pattern often produced by some models
      if (cleaned.startsWith("[") && cleaned.includes('"index":')) {
        cleaned = cleaned.replace(/"index":\s*(\d+)/g, "\$1");
        cleaned = cleaned.replace(/\{\s*(\d+)\s*\}/g, "\$1");
      }

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
            content: `Your previous response was not valid JSON. Please fix it and return ONLY the valid ${schemaDescription}. Ensure all items are properly quoted and comma-separated.`,
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
 * Generates a structured JSON summary of what the user is looking for based on their filters.
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
          content: `You are a universal professional job search strategist. Summarize the user's intent into a structured JSON response that serves any industry (Corporate, Healthcare, Education, Creative, etc.).
 
Strict JSON format requirements:
{
  "summary": "A descriptive paragraph (2-3 sentences) summarizing the intent. If the 'Keywords' is a specific tool, skill, or credential (e.g., 'Salesforce', 'SEO', 'Nursing License'), identify the professional roles that primarily use it (e.g., 'Account Executive', 'Marketing Specialist', 'Nurse') and frame the summary around those roles.",
  "titles": ["List of 3-4 specific job titles that utilize the provided keywords/skills across any relevant industry."],
  "relatedTitles": ["List of at least 8 job titles that are synonyms, adjacent roles, or related positions. Broaden the scope to include any professional environment where these skills are valuable (e.g., if 'Customer Success' is searched, include 'Account Manager', 'Client Relations Specialist', 'Customer Experience Coordinator', etc.)."]
}
 
Rules:
1. **Implicit Openness**: Mention 'open to all' for any missing/Any filters.
2. **Professional Role inference**: If a specific tool or skill is provided, prioritize the corresponding professional role names in the 'summary' and 'titles'.
3. **Inclusive Adjacency**: The 'relatedTitles' must contain at least 8 items that expand the search's reach into related professional domains.
4. **Format**: Output ONLY the raw JSON object.`,
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
    if (parsed && parsed.summary && Array.isArray(parsed.titles) && Array.isArray(parsed.relatedTitles)) {
      return parsed;
    }
  } catch (error) {
    console.warn("Unexpected error in generateJobDescription:", error);
  }
  return fallbackGoal;
}

/**
 * Generates a structured JSON summary specifically tailored for Greenhouse Job Boards.
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
          content: `You are a specialist recruiter focusing on company-specific job boards (Greenhouse). 
          Summarize the user's intent for searching a SPECIFIC company's openings.
          
          Strict JSON format requirements:
          {
            "summary": "A descriptive paragraph (2-3 sentences) summarizing the intent. Mention that we are targeting this specific company's board for ${keyword} roles.",
            "titles": ["List of 3-4 specific job titles that might exist on a corporate board for this keyword."],
            "relatedTitles": ["List of at least 8 adjacent role titles that might also be listed on the same board (e.g., if searching for 'Engineer', include 'Software Engineer', 'Systems Architect', 'Lead Dev', etc.)."]
          }
          
          Rules:
          1. **Corporate Context**: Frame the summary as a targeted search within a single company's ecosystem.
          2. **Inclusive Adjacency**: The 'relatedTitles' must expand the reach within the company's hierarchy.
          3. **Format**: Output ONLY the raw JSON object.`,
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
    if (parsed && parsed.summary && Array.isArray(parsed.titles) && Array.isArray(parsed.relatedTitles)) {
      return parsed;
    }
  } catch (error) {
    console.warn("Unexpected error in generateGreenhouseJobGoal:", error);
  }
  return fallbackGoal;
}

/**
 * Filters jobs using AI in a multi-stage process (Batch selection, Final narrowing, Strict vetting).
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
    // Stage 1: Regex Broad Match
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

      // Stage 2: Final narrowing to top 10
      if (intermediateJobs.length > 10) {
        console.log("Starting Stage 2: Final narrowing to top 10...");
        const finalPromptContent = `Pick the absolute top 10 most relevant jobs:\n${JSON.stringify(
          intermediateJobs.map((j, idx) => ({
            index: idx,
            title: cleanJobText(j.position),
            company: cleanJobText(j.company),
            location: cleanJobText(j.location),
          })),
        )}`;

        const finalPayload = {
          messages: [
            {
              role: "system",
              content: `You are a professional job selector. From the provided list of potential matches, select the absolute top 10 best matches that satisfy this search goal across any professional field. 
 
Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}
Related Roles: ${searchGoal.relatedTitles.join(", ")}
 
Focus on universal professional relevance. Select roles that directly match the user's career field and level. Output ONLY a valid JSON array of the integer indices.
Format: [index1, index2, ...]
Example: [0, 2, 9]`,
            },
            {
              role: "user",
              content: finalPromptContent,
            },
          ],
          temperature: 0.0,
          max_tokens: 1550,
        };

        const finalIndices = await callAiWithJsonRetry<number[]>(model, baseUrl, finalPayload, "JSON array of 10 indices");
        if (Array.isArray(finalIndices) && finalIndices.length > 0) {
          aiFilteredJobs = finalIndices
            .filter((idx) => typeof idx === "number" && idx >= 0 && idx < intermediateJobs.length)
            .map((idx) => ({ ...intermediateJobs[idx], isVetted: false }));
        } else {
          aiFilteredJobs = intermediateJobs.slice(0, 10).map((j) => ({ ...j, isVetted: false }));
        }
      } else {
        aiFilteredJobs = intermediateJobs.map((j) => ({ ...j, isVetted: false }));
        console.log(`Total picks (${aiFilteredJobs.length}) is already <= 10. Skipping Stage 2.`);
      }

      // Stage 3: Strict Vetting
      if (aiFilteredJobs.length > 0) {
        console.log("Starting Stage 3: Strict Vetting...");
        const vettingPromptContent = `BE EXTREMELY STRICT. If you have any doubt about a job's relevance, remove it. Output ONLY indices of guaranteed matches.\nJobs to vet:\n${JSON.stringify(
          aiFilteredJobs.map((j, idx) => ({
            index: idx,
            title: cleanJobText(j.position),
            company: cleanJobText(j.company),
            location: cleanJobText(j.location),
          })),
        )}`;

        const vettingPayload = {
          messages: [
            {
              role: "system",
              content: `You are a professional job auditor. Triple-check these jobs and output ONLY a JSON array of those that are GUARANTEED matches for this search goal, regardless of industry:
 
Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}
 
Be extremely strict. Ensure the role, seniority, and core function match the user's intent. CRITICAL: Deduce the physical country of the job from its location field. If it does not conceptually match the target country mentioned in the Intent, reject it immediately. Output ONLY a valid JSON array of the integer indices.
Format: [index1, index2, ...]
Example: [1, 3]`,
            },
            {
              role: "user",
              content: vettingPromptContent,
            },
          ],
          temperature: 0.1,
          max_tokens: 750,
        };

        const vettedIndices = await callAiWithJsonRetry<number[]>(model, baseUrl, vettingPayload, "JSON array of vetted indices");
        if (Array.isArray(vettedIndices)) {
          const vettedSet = new Set(vettedIndices.map((idx) => Number(idx)));
          aiFilteredJobs.forEach((job, idx) => {
            job.isVetted = vettedSet.has(idx);
          });
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
 * Rapidly optimizes a search keyword by expanding it into semantically related professional terms.
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
          .replace(/[,\.]/g, " ")
          .replace(/\s\s+/g, " ")
          .trim();
      }
    } catch (err: any) {
      if (attempt === 2) {
        console.warn(`[WARN] Keyword Optimization Failed after 2 attempts: ${err.message}`);
      } else {
        console.log(`[RETRY] Retrying Keyword Optimization (Attempt ${attempt + 1})...`);
      }
    }
  }

  return keyword;
}

// Simple in-memory cache for country normalization to prevent duplicate AI calls.
const countryCache: Record<string, string> = {};

// Per-key in-flight promise deduplication.
// If two requests normalise the same country simultaneously, the second
// attaches to the first's promise instead of firing a second AI call.
const countryInflight: Record<string, Promise<string>> = {};

/**
 * Normalizes a country name using AI to ensure formal spelling and formatting.
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

  // If a request for this key is already in-flight, reuse it.
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
        countryCache[safeCountry] = formalized;
        console.log(`[NORM] AI Normalization result: "${safeCountry}" -> "${formalized}"`);
        return formalized;
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
 * Extracts key functional sections from a job description and thins out boilerplate.
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
 * Evaluates a job description against a search goal to provide a compatibility score and targeted reasons.
 */
export async function rateJobCompatibility(
  description: string,
  searchGoal: SearchGoal,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ score: number; reasons: string[] }> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Rating Compatibility... (Model: ${safeModel}, Length: ${safeDescription.length})`);

  const payload = {
    model: safeModel,
    messages: [
      {
        role: "system",
        content: `Compare the job description with the user's search intent. Output ONLY a valid JSON object.
 
Intent: "${searchGoal.summary}"
 
Format:
{
  "score": integer (0-100),
  "reasons": ["3-4 bulleted reasons focusing on skills and seniority"]
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

  try {
    const response = await enqueue(() =>
      axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );
    const content = response.data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(cleanJsonString(content));
    return {
      score: typeof parsed.score === "number" ? parsed.score : 0,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ["Analysis inconclusive."],
    };
  } catch (err: any) {
    console.error(`[WARN] Compatibility Rating Failed: ${err.message} (URL: ${endpoint})`);
    return { score: 0, reasons: ["Failed to calculate compatibility."] };
  }
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
          "You are a workplace culture analyst. Identify the benefits (perks, flexible work, etc.) and the company culture mentioned or implied in the job description. Use **bold** for key perks and *italics* for cultural keywords. 2-3 sentences only.",
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
 */
export async function analyzeJobProsAndCons(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ pros: string[]; cons: string[] }> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Analyzing Pros & Cons... (Model: ${safeModel})`);

  const payload = {
    model: safeModel,
    messages: [
      {
        role: "system",
        content: `Identify strategic Pros and Cons for the role. Output a valid JSON object. Use **bold** for high-impact keywords.
        
Format:
{
  "pros": ["2-3 specific advantages"],
  "cons": ["2-3 objective challenges or drawbacks"]
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

  try {
    const response = await enqueue(() =>
      axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );
    const content = response.data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(cleanJsonString(content));
    return {
      pros: Array.isArray(parsed.pros) ? parsed.pros : ["Analysis inconclusive."],
      cons: Array.isArray(parsed.cons) ? parsed.cons : ["Analysis inconclusive."],
    };
  } catch (err: any) {
    console.error(`[WARN] Pros/Cons Analysis Failed: ${err.message}`);
    return { pros: ["Failed to analyze pros."], cons: ["Failed to analyze cons."] };
  }
}

/**
 * Extracts significant direct quotes from a job description.
 */
export async function extractJobQuotes(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string[]> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const safeModel = String(model || DEFAULT_AI_MODEL);
  const safeDescription = thinJobContent(description);

  console.log(`[AI] Extracting Key Quotes... (Model: ${safeModel})`);

  const payload = {
    model: safeModel,
    messages: [
      {
        role: "system",
        content: `Identify the 3 most significant or telling direct quotes from the job description that characterize the role's essence, seniority, or unique challenges. 
        Return ONLY a valid JSON array of strings. Do not include any text outside the JSON array.
        
Example: ["Quote 1", "Quote 2", "Quote 3"]`,
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
    const content = response.data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(cleanJsonString(content));
    return Array.isArray(parsed) ? parsed : ["Analysis inconclusive."];
  } catch (err: any) {
    console.error(`[WARN] Quotes Extraction Failed: ${err.message}`);
    return ["Failed to extract quotes."];
  }
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
        return { totalAttempts, latencies, healthSummary: "Connection timed out after 5 attempts.", status: "offline" };
      }
    }
  }

  try {
    const validLatencies = latencies.filter((l) => l > 0);
    const avgLatencey = validLatencies.length
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
      : 0;

    const summaryPayload = {
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a system health agent. Analyze the provided latency data and attempt count. Summarize the model's performance in one professional sentence. Use bullet points or technical jargon if appropriate. No fluff.",
        },
        {
          role: "user",
          content: `Inference Probe Stats: Attempts: ${totalAttempts}, Avg Latency: ${avgLatencey}ms. Status: Success at attempt ${totalAttempts}.`,
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
      status: avgLatencey < 1500 ? "optimal" : "degraded",
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