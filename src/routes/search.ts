import { Router, Request, Response } from "express";
import linkedIn from "linkedin-jobs-api";
import { 
  optimizeSearchKeywords, 
  normalizeCountry, 
  generateJobDescription, 
  filterJobsWithAI 
} from "../services/ai";
import { getEffectiveQueryOptions } from "../args";
import { Job } from "../types";

const router = Router();

/**
 * Handle incoming LinkedIn search requests.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { goal, model, baseUrl, targetCountry, ...clientOptions } = req.body;
    let normalizedCountry = targetCountry;
    if (targetCountry) {
      normalizedCountry = await normalizeCountry(targetCountry, model, baseUrl);
    }
    const queryOptions = {
      ...getEffectiveQueryOptions(),
      ...clientOptions,
      targetCountry: normalizedCountry,
    };

    console.log(`[START] API Search: "${queryOptions.keyword}" (${queryOptions.location || "Global"})`);

    const originalKeyword = queryOptions.keyword;
    try {
      const optimized = await optimizeSearchKeywords(originalKeyword, model, baseUrl);
      if (optimized !== originalKeyword) {
        console.log(`[AI] Expanded Keywords: "${optimized}"`);
        queryOptions.keyword = optimized;
      }
    } catch (optError: any) {
      console.warn(`[WARN] Keyword Optimization Failed: ${optError.message}`);
    }

    let allJobs: Job[] = [];
    try {
      const jobsResponse = await (linkedIn as any).query(queryOptions);
      if (Array.isArray(jobsResponse)) {
        allJobs = jobsResponse;
      }
    } catch (crawlError: any) {
      console.error(`[ERROR] LinkedIn Crawl ERROR: ${crawlError.message}`);
    }

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      try {
        const intentOptions = { ...queryOptions, keyword: originalKeyword };
        const effectiveGoal = goal || (await generateJobDescription(intentOptions, model, baseUrl));

        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        console.error(`[ERROR] AI Processing ERROR: ${aiError.message}`);
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
    }

    res.json({ allJobs, topPicks, aiError: aiErrorMessage });
  } catch (error: any) {
    console.error("API Search Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
