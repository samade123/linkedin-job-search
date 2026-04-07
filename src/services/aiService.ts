// src/services/aiService.ts
import { Job, QueryOptions } from "../types";
import { cleanJobText } from "../utils";

const BATCH_SIZE = 20;

/**
 * Filters jobs using AI in a multi-stage process (Batch selection, Final narrowing, Strict vetting).
 */
export async function filterJobsWithAI(
  jobs: Job[],
  queryOptions: QueryOptions
): Promise<{ filteredJobs: Job[]; errorMessage: string }> {
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
        }))
      )}`;

      const rawPayload = JSON.stringify({
        model: "NexaAI/Llama3.2-3B-NPU-Turbo",
        messages: [
          {
            role: "system",
            content: `You are a job filter assistant. Select the top 2-3 most highly relevant tech jobs from the provided list based on these specific user filters: 
- Keywords: ${queryOptions.keyword}
- Location: ${queryOptions.location}
- Job Type: ${queryOptions.jobType || "Any"}
- Remote Preference: ${queryOptions.remoteFilter || "Any"}
- Minimum Salary: ${queryOptions.salary || "Not specified"}
- Experience Level: ${queryOptions.experienceLevel || "Any"}
Rank jobs by their match to all these criteria. Output ONLY a valid JSON array of the unique integer indexes. No text, markdown, or explanation.`,
          },
          {
            role: "user",
            content: promptContent,
          },
        ],
        temperature: 0.0,
        max_tokens: 150,
      });

      const response = await fetch("http://127.0.0.1:18181/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      if (response.ok) {
        const data: any = await response.json();
        let content = data.choices[0].message.content.trim();

        // Extract JSON array
        const startIndex = content.indexOf("[");
        const endIndex = content.lastIndexOf("]");
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          content = content.substring(startIndex, endIndex + 1);
        }

        try {
          const parsedIndices = JSON.parse(content);
          if (Array.isArray(parsedIndices)) {
            parsedIndices.forEach((idx) => {
              const numIdx = Number(idx);
              if (!isNaN(numIdx) && numIdx >= batchStartIndex && numIdx < batchStartIndex + batch.length) {
                selectedIndices.add(numIdx);
              }
            });
          }
        } catch (e) {
          console.warn(`Failed to parse AI response for batch starting at ${i}:`, content);
        }
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
          }))
        )}`;

        const finalRawPayload = JSON.stringify({
          model: "NexaAI/Llama3.2-3B-NPU-Turbo",
          messages: [
            {
              role: "system",
              content: `You are a final stage job selector. From the provided list of high-quality jobs, select the absolute top 10 best matches based on filters. Output ONLY a valid JSON array of the local integer indexes. No text.`,
            },
            {
              role: "user",
              content: finalPromptContent,
            },
          ],
          temperature: 0.0,
          max_tokens: 150,
        });

        const finalResponse = await fetch("http://127.0.0.1:18181/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: finalRawPayload,
        });

        if (finalResponse.ok) {
          const finalData: any = await finalResponse.json();
          let finalContent = finalData.choices[0].message.content.trim();
          const sIdx = finalContent.indexOf("[");
          const eIdx = finalContent.lastIndexOf("]");
          if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
            finalContent = finalContent.substring(sIdx, eIdx + 1);
          }

          try {
            const finalIndices = JSON.parse(finalContent);
            if (Array.isArray(finalIndices) && finalIndices.length > 0) {
              aiFilteredJobs = finalIndices
                .filter((idx) => typeof idx === "number" && idx >= 0 && idx < intermediateJobs.length)
                .map((idx) => intermediateJobs[idx]);
            } else {
              aiFilteredJobs = intermediateJobs.slice(0, 10);
            }
          } catch (e) {
            aiFilteredJobs = intermediateJobs.slice(0, 10);
          }
        } else {
          aiFilteredJobs = intermediateJobs.slice(0, 10);
        }
      } else {
        aiFilteredJobs = intermediateJobs;
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
          }))
        )}`;

        const vettingRawPayload = JSON.stringify({
          model: "NexaAI/Llama3.2-3B-NPU-Turbo",
          messages: [
            {
              role: "system",
              content: `You are a strict job auditor. Triple-check the provided jobs and output ONLY a JSON array of the indexes that are GUARANTEED matches. No text.`,
            },
            {
              role: "user",
              content: vettingPromptContent,
            },
          ],
          temperature: 0.0,
          max_tokens: 100,
        });

        const vettingResponse = await fetch("http://127.0.0.1:18181/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: vettingRawPayload,
        });

        if (vettingResponse.ok) {
          const vettingData: any = await vettingResponse.json();
          let vettingContent = vettingData.choices[0].message.content.trim();
          const sIdx = vettingContent.indexOf("[");
          const eIdx = vettingContent.lastIndexOf("]");
          if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
            vettingContent = vettingContent.substring(sIdx, eIdx + 1);
          }

          try {
            const vettedIndices = JSON.parse(vettingContent);
            if (Array.isArray(vettedIndices)) {
              aiFilteredJobs = vettedIndices
                .filter((idx) => typeof idx === "number" && idx >= 0 && idx < aiFilteredJobs.length)
                .map((idx) => aiFilteredJobs[idx]);
              console.log(`Stage 3 complete. Vetted selection: ${aiFilteredJobs.length} jobs.`);
            }
          } catch (e) {
            console.warn("Failed to parse Stage 3 vetting response.");
          }
        }
      }
    }
  } catch (e: any) {
    aiErrorMessage = `AI filtering error: ${e.message}`;
    console.error("AI Filtering error:", e);
  }

  return { filteredJobs: aiFilteredJobs, errorMessage: aiErrorMessage };
}
