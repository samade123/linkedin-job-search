import axios from "axios";
import { Job, QueryOptions, SearchGoal } from "../types";
import { cleanJobText } from "../utils";

const BATCH_SIZE = 20;
// const AI_MODEL = "NexaAI/Llama3.2-3B-NPU-Turbo";
const AI_MODEL = "NexaAI/OmniNeural-4B";
const AI_ENDPOINT = "http://127.0.0.1:18181/v1/chat/completions";

/**
 * Utility to strip markdown and clean string for JSON parsing.
 */
function cleanJsonString(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json/, "");
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```/, "");
  if (cleaned.endsWith("```")) cleaned = cleaned.replace(/```$/, "");
  return cleaned.trim();
}

/**
 * Executes an AI request and attempts to fix the JSON if parsing fails.
 */
async function callAiWithJsonRetry<T>(
  initialPayload: any,
  schemaDescription: string,
  isRetry: boolean = false
): Promise<T | null> {
  try {
    const response = await axios.post(AI_ENDPOINT, initialPayload, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.status !== 200) return null;
    
    const content = response.data.choices[0].message.content.trim();
    console.log(`🤖 AI Response [${schemaDescription}]: ${content}`);
    const cleaned = cleanJsonString(content);

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
        messages: [
          ...initialPayload.messages,
          { role: "assistant", content: content },
          { 
            role: "user", 
            content: `Your previous response was not valid JSON. Please fix it and return ONLY the valid ${schemaDescription}. Ensure all items are properly quoted and comma-separated.` 
          }
        ]
      };
      
      return callAiWithJsonRetry<T>(retryPayload, schemaDescription, true);
    }
  } catch (err: any) {
    console.error(`❌ AI Request Error: ${err.message}`);
    return null;
  }
}

/**
 * Generates a structured JSON summary of what the user is looking for based on their filters.
 */
export async function generateJobDescription(queryOptions: QueryOptions): Promise<SearchGoal> {
  const fallbackGoal: SearchGoal = {
    summary: `Searching for ${queryOptions.keyword}${queryOptions.location ? ` in ${queryOptions.location}` : ""}${queryOptions.jobType ? ` (${queryOptions.jobType})` : ""}${queryOptions.remoteFilter ? ` (${queryOptions.remoteFilter})` : ""}.`,
    titles: [queryOptions.keyword],
  };

  try {
    const payload = {
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are an intelligent job search strategist. Summarize the user's intent based on their filters into a structured JSON response.

Strict JSON format requirements:
{
  "summary": "A descriptive paragraph (2-3 sentences) summarizing the intent. If the 'Keywords' is a specific tool or skill (e.g., 'React', 'Docker'), identify the professional roles that primarily use it (e.g., 'Frontend Engineer', 'DevOps Engineer') and frame the summary around those roles.",
  "titles": ["List of 3-4 specific, high-relevance professional job titles that utilize the provided keywords/skills."]
}

Rules:
1. **Implicit Openness**: Mention 'open to all' for any missing/Any filters.
2. **Professional Role Inference**: If a technical skill is provided, prioritize related professional role names in the 'summary' and 'titles'.
3. **Format**: Output ONLY the raw JSON object.`,
        },
        {
          role: "user",
          content: `Translate these filters into a structured search goal:
- Keywords: ${queryOptions.keyword}
- Location: ${queryOptions.location || "Global"}
- Job Type: ${queryOptions.jobType || "Any"}
- Remote: ${queryOptions.remoteFilter || "Any"}
- Salary: ${queryOptions.salary || "Not specified"}
- Experience: ${queryOptions.experienceLevel || "Any"}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    };

    const parsed = await callAiWithJsonRetry<SearchGoal>(payload, "SearchGoal JSON object");
    if (parsed && parsed.summary && Array.isArray(parsed.titles)) {
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
export async function filterJobsWithAI(jobs: Job[], searchGoal: SearchGoal): Promise<{ filteredJobs: Job[]; errorMessage: string }> {
  let aiFilteredJobs: Job[] = [];
  let aiErrorMessage = "";

  console.log("Starting optimized AI filtering...");

  try {
    const selectedIndices = new Set<number>();

    // Stage 1: Batch selection
    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE);
      const batchStartIndex = i;

      console.log(`Processing AI batch ${i / BATCH_SIZE + 1} (${batch.length} jobs)...`);

      const promptContent = `Jobs to evaluate:\n${JSON.stringify(
        batch.map((j, idx) => ({
          index: batchStartIndex + idx,
          title: cleanJobText(j.position),
          company: cleanJobText(j.company),
          location: cleanJobText(j.location),
        })),
      )}`;

      const payload = {
        model: AI_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a job filter assistant. Select the top 2-3 most highly relevant tech jobs from the provided list based on this search goal:

Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}

Evaluate jobs based on their functional alignment with these professional roles and skills. Prioritize jobs that fit the professional context even if the exact keyword is implicitly used. Output ONLY a valid JSON array of indices.`,
          },
          {
            role: "user",
            content: promptContent,
          },
        ],
        temperature: 0.0,
        max_tokens: 500,
      };

      const parsedIndices = await callAiWithJsonRetry<number[]>(payload, "JSON array of indices");
      if (Array.isArray(parsedIndices)) {
        parsedIndices.forEach((idx) => {
          const numIdx = Number(idx);
          if (!isNaN(numIdx) && numIdx >= batchStartIndex && numIdx < batchStartIndex + batch.length) {
            selectedIndices.add(numIdx);
          }
        });
      }
    }

    if (selectedIndices.size > 0) {
      let intermediateJobs = Array.from(selectedIndices).map((idx) => jobs[idx]);
      console.log(`Stage 1 complete. Aggregated ${intermediateJobs.length} potential picks.`);

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
          model: AI_MODEL,
          messages: [
            {
              role: "system",
              content: `You are a final stage job selector. From the provided list of potential matches, select the absolute top 10 best matches that satisfy this search goal:

Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}

Focus on the professional relevance and seniority. Ensure the roles are a logical fit for someone with the skills described. Output ONLY a valid JSON array of the local integer indexes.`,
            },
            {
              role: "user",
              content: finalPromptContent,
            },
          ],
          temperature: 0.0,
          max_tokens: 1550,
        };

        const finalIndices = await callAiWithJsonRetry<number[]>(finalPayload, "JSON array of 10 indices");
        if (Array.isArray(finalIndices) && finalIndices.length > 0) {
          aiFilteredJobs = finalIndices
            .filter((idx) => typeof idx === "number" && idx >= 0 && idx < intermediateJobs.length)
            .map((idx) => ({ ...intermediateJobs[idx], isVetted: false }));
        } else {
          aiFilteredJobs = intermediateJobs.slice(0, 10).map(j => ({ ...j, isVetted: false }));
        }
      } else {
        aiFilteredJobs = intermediateJobs.map(j => ({ ...j, isVetted: false }));
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
          model: AI_MODEL,
          messages: [
            {
              role: "system",
              content: `You are a strict job auditor. Triple-check these jobs and output ONLY a JSON array of those that are GUARANTEED matches for this search goal:

Intent: "${searchGoal.summary}"
Target Roles: ${searchGoal.titles.join(", ")}

Be extremely strict. Prioritize jobs that fit the professional context of the skills provided. If a job only mentions the skill but isn't for a relevant role, discard it. Output ONLY a valid JSON array of indices.`,
            },
            {
              role: "user",
              content: vettingPromptContent,
            },
          ],
          temperature: 0.0,
          max_tokens: 1500,
        };

        const vettedIndices = await callAiWithJsonRetry<number[]>(vettingPayload, "JSON array of vetted indices");
        if (Array.isArray(vettedIndices)) {
          const vettedSet = new Set(vettedIndices.map(idx => Number(idx)));
          aiFilteredJobs.forEach((job, idx) => {
            if (vettedSet.has(idx)) {
              job.isVetted = true;
            }
          });
          console.log(`Stage 3 complete. Tagged ${vettedIndices.length} strictly vetted jobs.`);
        }
      }
    }
  } catch (e: any) {
    aiErrorMessage = `AI filtering error: ${e.message}`;
    console.error("AI Filtering error:", e);
  }

  return { filteredJobs: aiFilteredJobs, errorMessage: aiErrorMessage };
}
