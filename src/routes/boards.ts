import { Router, Request, Response } from "express";
import axios from "axios";
import { 
  normalizeCountry, 
  generateCompanyJobGoal, 
  filterJobsWithAI 
} from "../services/ai";
import { Job } from "../types";
import { cleanJobText } from "../utils";

const router = Router();

/**
 * Greenhouse Search
 */
router.post("/greenhouse/search", async (req: Request, res: Response) => {
  try {
    const { boardId, keyword, model, baseUrl, goal } = req.body;
    
    let allJobs: Job[] = [];
    try {
      const gRes = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs?content=true`);
      const rawJobs = gRes.data.jobs || [];

      const formatTimeAgo = (dateStr: string): string => {
        const date = new Date(dateStr);
        const diffMs = Date.now() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "1 day ago";
        return `${diffDays} days ago`;
      };

      allJobs = rawJobs.map((j: any) => ({
        id: j.id,
        position: cleanJobText(j.title || "Unknown"),
        company: cleanJobText(j.company_name || boardId),
        location: cleanJobText(j.location?.name || "Unknown"),
        date: j.updated_at || "",
        agoTime: j.updated_at ? formatTimeAgo(j.updated_at) : "",
        jobUrl: j.absolute_url || "",
        content: cleanJobText(j.content || ""),
      }));
    } catch (crawlError: any) {
      return res.status(500).json({ error: "Failed to fetch from Greenhouse" });
    }

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      try {
        const { targetCountry } = req.body;
        let normalizedCountry = targetCountry;
        if (targetCountry) {
          normalizedCountry = await normalizeCountry(targetCountry, model, baseUrl);
        }
        const effectiveGoal = goal || (await generateCompanyJobGoal(keyword, "Greenhouse", normalizedCountry, model, baseUrl));
        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
    }

    res.json({ allJobs, topPicks, aiError: aiErrorMessage });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Ashby Search
 */
router.post("/ashby/search", async (req: Request, res: Response) => {
  try {
    const { boardId, keyword, model, baseUrl, goal } = req.body;

    let allJobs: Job[] = [];
    try {
      const aRes = await axios.get(`https://api.ashbyhq.com/posting-api/job-board/${boardId}?includeCompensation=false`);
      const rawJobs = aRes.data.jobs || [];

      const formatTimeAgo = (dateStr: string): string => {
        const date = new Date(dateStr);
        const diffMs = Date.now() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "1 day ago";
        return `${diffDays} days ago`;
      };

      allJobs = rawJobs.map((j: any) => ({
        id: j.id,
        position: cleanJobText(j.title || "Unknown"),
        company: cleanJobText(j.team || boardId),
        location: cleanJobText(j.location || "Unknown"),
        date: j.publishedAt || "",
        agoTime: j.publishedAt ? formatTimeAgo(j.publishedAt) : "",
        jobUrl: j.jobUrl || "",
        content: cleanJobText(j.descriptionHtml || ""),
      }));
    } catch (crawlError: any) {
      return res.status(500).json({ error: "Failed to fetch from Ashby" });
    }

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      try {
        const { targetCountry } = req.body;
        let normalizedCountry = targetCountry;
        if (targetCountry) {
          normalizedCountry = await normalizeCountry(targetCountry, model, baseUrl);
        }
        const effectiveGoal = goal || (await generateCompanyJobGoal(keyword, "Ashby", normalizedCountry, model, baseUrl));
        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
    }

    res.json({ allJobs, topPicks, aiError: aiErrorMessage });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
