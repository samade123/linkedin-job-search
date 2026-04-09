import axios from "axios";
import { Job, QueryOptions, SearchGoal } from "../types";
import { cleanJobText } from "../utils";

const BATCH_SIZE = 20;
export const DEFAULT_AI_MODEL = "NexaAI/OmniNeural-4B";
export const DEFAULT_BASE_URL = "http://127.0.0.1:18181/v1";

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
        cleaned = cleaned.replace(/"index":\s*(\d+)/g, "$1");
        // Also remove potential extra braces if the model did [{"index": 1}] when we wanted [1]
        cleaned = cleaned.replace(/\{\s*(\d+)\s*\}/g, "$1");
      }

      return cleaned;
    }
  }

  return text;
}

/**
 * Executes an AI request and attempts to fix the JSON if parsing fails.
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
    const response = await axios.post(endpoint, payloadWithModel, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000, // 15s safety timeout for filtering/goal
    });

    if (response.status !== 200) return null;

    const content = response.data.choices[0].message.content.trim();
    console.log(`🤖 AI Response [${schemaDescription}]: ${content}`);
    const cleaned = cleanJsonString(content);
    console.log(`🧹 Cleaned Response [${schemaDescription}]: ${cleaned}`);

    try {
      return JSON.parse(cleaned) as T;
    } catch (parseError) {
      if (isRetry) {
        console.error(`❌ AI failed to provide valid JSON even after retry: ${cleaned}`);
        return null;
      }

      console.warn(`⚠️ AI provided malformed JSON. Attempting self-correction for ${schemaDescription}...`);

      const retryPayload = {
        ...initialPayload,
        model, // Ensure model is passed
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
    console.error(`❌ AI Request Error: ${err.message}`);
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
          temperature: 0.0,
          max_tokens: 1500,
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
    console.error(`❌ ${aiErrorMessage}`);
  }

  return { filteredJobs: aiFilteredJobs, errorMessage: aiErrorMessage };
}

/**
 * Rapidly optimizes a search keyword by expanding it into semantically related professional terms.
 * This is used BEFORE the LinkedIn search to fetch a more relevant initial dataset.
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
        content: "Fix typos in the user's keyword and expand to 3-4 professional search terms across any relevant industry. Space-separated only. No extra text.",
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

  // Micro-retry loop (2 attempts)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.post(endpoint, payloadWithModel, {
        headers: { "Content-Type": "application/json" },
        timeout: 4500, // 4.5s aggressive timeout per attempt
      });

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
        console.warn(`⚠️ Keyword Optimization Failed after 2 attempts: ${err.message}`);
      } else {
        console.log(`🔄 Retrying Keyword Optimization (Attempt ${attempt + 1})...`);
      }
    }
  }

  return keyword; // Full fallback
}

/**
 * Normalizes a country name using AI to ensure formal spelling and formatting.
 */
export async function normalizeCountry(
  country: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  if (!country || country.toLowerCase() === "global" || country.toLowerCase() === "any") {
    return "Global";
  }

  const payload = {
    messages: [
      {
        role: "system",
        content: "You are a geographic data specialist. Normalize the provided country name into its formal, standard English name (e.g., 'the states' -> 'United States', 'uk' -> 'United Kingdom'). If the input is already formal, return it as is. If it's not a recognized country, return the input. Return ONLY the formal name, no extra text.",
      },
      {
        role: "user",
        content: `Country: ${country}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 32,
  };

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payloadWithModel = { ...payload, model };

  try {
    const response = await axios.post(endpoint, payloadWithModel, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });

    const content = response.data.choices[0]?.message?.content?.trim();
    if (content) {
      return content.replace(/[,\.]/g, "").trim();
    }
  } catch (err: any) {
    console.warn(`⚠️ Country Normalization Failed: ${err.message}`);
  }

  return country;
}

/**
 * Summarizes a full job description into a concise 2-3 sentence overview.
 */
export async function summarizeJobRole(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const payload = {
    messages: [
      {
        role: "system",
        content: "You are an expert technical recruiter. Summarize the provided job description into a high-impact, professional summary of exactly 2-3 sentences focusing on the primary responsibilities and the core value the role brings. No fluff. No extra text.",
      },
      {
        role: "user",
        content: `Job Description (HTML removed): ${description.substring(0, 8000)}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 250,
  };

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payloadWithModel = { ...payload, model };

  try {
    const response = await axios.post(endpoint, payloadWithModel, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
    return response.data.choices[0]?.message?.content?.trim() || "Summary unavailable.";
  } catch (err: any) {
    console.warn(`⚠️ Summarization Failed: ${err.message}`);
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
  const payload = {
    messages: [
      {
        role: "system",
        content: `You are a career matching engine. Compare the job description with the user's search intent. Output ONLY a valid JSON object.
 
Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}
 
Format:
{
  "score": integer (0-100),
  "reasons": ["3-4 bulleted reasons explaining the score focusing on skills, location, and seniority alignment"]
}`,
      },
      {
        role: "user",
        content: `Job Description: ${description.substring(0, 8000)}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
  };

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payloadWithModel = { ...payload, model };

  try {
    const response = await axios.post(endpoint, payloadWithModel, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
    const content = response.data.choices[0]?.message?.content?.trim();
    const parsed = JSON.parse(cleanJsonString(content));
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ["Analysis inconclusive."]
    };
  } catch (err: any) {
    console.warn(`⚠️ Compatibility Rating Failed: ${err.message}`);
    return { score: 0, reasons: ["Failed to calculate compatibility."] };
  }
}
