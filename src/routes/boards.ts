import { Router, Request, Response } from "express";
import axios from "axios";
import { 
  normalizeCountry, 
  generateCompanyJobGoal, 
  filterJobsWithAI 
} from "../services/ai";
import { Job } from "../types";
import { normalizeJob } from "../utils/normalizeJob";

const router = Router();

/**
 * Greenhouse Search
 */
router.post("/greenhouse/search", async (req: Request, res: Response) => {
  try {
    const { boardId, keyword, model, baseUrl, goal, targetCountry } = req.body;
    let allJobs: Job[] = [];

    try {
      const gRes = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs?content=true`);
      const rawJobs = gRes.data.jobs || [];
      
      console.log(`[Greenhouse] Board: ${boardId} | Raw jobs: ${rawJobs.length}`);
      
      allJobs = rawJobs.map((j: any) => normalizeJob(j, "greenhouse"));

      if (allJobs.length > 0) {
        console.log(`[DEBUG] Greenhouse Job 0 descriptionHtml Sample: ${allJobs[0].descriptionHtml?.substring(0, 100)}...`);
      }
    } catch (crawlError: any) {
      console.error("[Greenhouse] Fetch failed:", crawlError.message);
      return res.status(500).json({ error: "Failed to fetch from Greenhouse" });
    }

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      try {
        const normalizedCountry = targetCountry ? await normalizeCountry(targetCountry, model, baseUrl) : targetCountry;
        const effectiveGoal = goal || (await generateCompanyJobGoal(keyword, "Greenhouse", normalizedCountry, model, baseUrl));

        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        console.error("[ERROR] AI Processing ERROR:", aiError.message);
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
    }

    res.json({ allJobs, topPicks, aiError: aiErrorMessage });
  } catch (error: any) {
    console.error("Board Search Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Ashby Search
 */
router.post("/ashby/search", async (req: Request, res: Response) => {
  try {
    const { boardId, keyword, model, baseUrl, goal, targetCountry } = req.body;
    let allJobs: Job[] = [];

    try {
      const aRes = await axios.get(`https://api.ashbyhq.com/posting-api/job-board/${boardId}?includeCompensation=false`);
      const rawJobs = aRes.data.jobs || [];
      
      console.log(`[Ashby] Board: ${boardId} | Raw jobs: ${rawJobs.length}`);
      
      allJobs = rawJobs.map((j: any) => normalizeJob(j, "ashby"));

      if (allJobs.length > 0) {
        console.log(`[DEBUG] Ashby Job 0 descriptionHtml Sample: ${allJobs[0].descriptionHtml?.substring(0, 100)}...`);
      }
    } catch (crawlError: any) {
      console.error("[Ashby] Fetch failed:", crawlError.message);
      return res.status(500).json({ error: "Failed to fetch from Ashby" });
    }

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      try {
        const normalizedCountry = targetCountry ? await normalizeCountry(targetCountry, model, baseUrl) : targetCountry;
        const effectiveGoal = goal || (await generateCompanyJobGoal(keyword, "Ashby", normalizedCountry, model, baseUrl));

        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        console.error("[ERROR] AI Processing ERROR:", aiError.message);
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
    }

    res.json({ allJobs, topPicks, aiError: aiErrorMessage });
  } catch (error: any) {
    console.error("Board Search Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Workable Search
 */
router.post("/workable/search", async (req: Request, res: Response) => {
  try {
    const { boardId, keyword, model, baseUrl, goal, targetCountry } = req.body;
    let allJobs: Job[] = [];

    try {
      const wRes = await axios.get(`https://apply.workable.com/api/v1/widget/accounts/${boardId}?details=true`);
      const rawJobs = wRes.data.jobs || [];
      const accountName = wRes.data.name || boardId;
      
      console.log(`[Workable] Board: ${boardId} | Raw jobs: ${rawJobs.length}`);
      
      allJobs = rawJobs.map((j: any) => normalizeJob({ ...j, accountName }, "workable"));

      if (allJobs.length > 0) {
        console.log(`[DEBUG] Workable Job 0 descriptionHtml Sample: ${allJobs[0].descriptionHtml?.substring(0, 100)}...`);
      }
    } catch (crawlError: any) {
      console.error("[Workable] Fetch failed:", crawlError.message);
      return res.status(500).json({ error: "Failed to fetch from Workable" });
    }

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      try {
        const normalizedCountry = targetCountry ? await normalizeCountry(targetCountry, model, baseUrl) : targetCountry;
        const effectiveGoal = goal || (await generateCompanyJobGoal(keyword, "Workable", normalizedCountry, model, baseUrl));

        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        console.error("[ERROR] AI Processing ERROR:", aiError.message);
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
    }

    res.json({ allJobs, topPicks, aiError: aiErrorMessage });
  } catch (error: any) {
    console.error("Board Search Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
