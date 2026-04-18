import { Job } from "../../types";
import { SearchGoal } from "./types";
import { cleanJobText } from "../../utils";
import { callAiWithJsonRetry, DEFAULT_AI_MODEL, DEFAULT_BASE_URL } from "./core.service";

/**
 * Filters jobs using AI in a multi-stage process.
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
    const allTerms = [...searchGoal.titles, ...searchGoal.relatedTitles]
      .flatMap((t) => t.split(/\s+/))
      .filter((t) => t.length > 2)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    if (allTerms.length === 0) {
      aiFilteredJobs = jobs.slice(0, 50).map((j) => ({ ...j, isVetted: false }));
    } else {
      const pattern = new RegExp(allTerms.join("|"), "i");
      const intermediateJobs = jobs.filter((job) => pattern.test(job.position) || pattern.test(job.company));

      // Stage 2: AI narrows to top 10
      if (intermediateJobs.length > 10) {
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

        const validIndices = Array.isArray(finalIndices)
          ? finalIndices.filter((idx) => typeof idx === "number" && idx >= 0 && idx < intermediateJobs.length)
          : [];

        if (validIndices.length >= 5) {
          aiFilteredJobs = validIndices.map((idx) => ({
            ...intermediateJobs[idx],
            isVetted: false,
          }));
        } else {
          aiFilteredJobs = intermediateJobs.slice(0, 10).map((j) => ({ ...j, isVetted: false }));
        }
      } else {
        aiFilteredJobs = intermediateJobs.map((j) => ({ ...j, isVetted: false }));
      }

      // Stage 3: Strict Vetting
      if (aiFilteredJobs.length > 0) {
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

Be extremely strict: If in doubt, reject.
Output ONLY a valid JSON array of the integer line numbers of guaranteed matches.
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
          aiErrorMessage = "Vetting stage failed — results are shown but have not been strictly vetted.";
        }
      }
    }
  } catch (err: any) {
    aiErrorMessage = `AI Filtering Error: ${err.message}`;
  }

  return { filteredJobs: aiFilteredJobs, errorMessage: aiErrorMessage };
}
