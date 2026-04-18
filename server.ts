// server.ts
import express, { Request, Response } from "express";
import path from "path";
import axios from "axios";
import linkedIn from "linkedin-jobs-api";
import open from "open";

// Import modules
import { Job } from "./src/types";
import { getEffectiveQueryOptions } from "./src/args";
import {
  filterJobsWithAI,
  generateJobDescription,
  generateGreenhouseJobGoal,
  optimizeSearchKeywords,
  normalizeCountry,
  summarizeJobRole,
  rateJobCompatibility,
  analyzeJobCultureAndBenefits,
  analyzeJobProsAndCons,
  extractJobQuotes,
  runAiDiagnostics,
} from "./src/services/aiService";
import { PORT, DEFAULT_AI_MODEL, DEFAULT_AI_BASE_URL as DEFAULT_BASE_URL } from "./src/config";
import { cleanJobText } from "./src/utils";

const app = express();

// Middleware
app.use(express.json());
const PUBLIC_PATH = path.resolve(process.cwd(), "client/dist");
app.use(express.static(PUBLIC_PATH));

console.log(`[FILES] Static files served from: ${PUBLIC_PATH}`);

/**
 * AI Warm-up endpoint to pre-load models.
 */
app.post("/api/warmup", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl } = req.body;
    console.log(`[WARMUP] AI Warm-up Triggered (Target: ${model || DEFAULT_AI_MODEL})`);
    await optimizeSearchKeywords("warmup", model || DEFAULT_AI_MODEL, baseUrl || DEFAULT_BASE_URL);
    res.json({ status: "warmed" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Proxy to fetch available models from the local AI server.
 */
app.get("/api/models", async (req: Request, res: Response) => {
  try {
    const modelsUrl = `${DEFAULT_BASE_URL.replace(/\/$/, "")}/models`;
    const response = await axios.get(modelsUrl);
    res.json(response.data);
  } catch (error: any) {
    console.warn("Failed to fetch models from local AI server:", error.message);
    // Return a safe fallback list if the server is offline or doesn't support the endpoint
    res.json({ data: [{ id: "NexaAI/OmniNeural-4B" }, { id: "NexaAI/Llama3.2-3B-NPU-Turbo" }] });
  }
});

/**
 * Endpoint for AI Search Goal generation (Fast response).
 */
app.post("/api/goal", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl, targetCountry, ...clientOptions } = req.body;
    let normalizedCountry = targetCountry;
    if (targetCountry) {
      normalizedCountry = await normalizeCountry(targetCountry, model, baseUrl);
    }
    const queryOptions = { ...getEffectiveQueryOptions(), ...clientOptions, targetCountry: normalizedCountry };
    const searchGoal = await generateJobDescription(queryOptions, model, baseUrl);
    res.json(searchGoal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle incoming search requests from the client.
 */
app.post("/api/search", async (req: Request, res: Response) => {
  try {
    const { goal, model, baseUrl, targetCountry, ...clientOptions } = req.body;
    let normalizedCountry = targetCountry;
    if (targetCountry) {
      normalizedCountry = await normalizeCountry(targetCountry, model, baseUrl);
    }
    const queryOptions = { ...getEffectiveQueryOptions(), ...clientOptions, targetCountry: normalizedCountry };

    console.log(`[START] API Search: "${queryOptions.keyword}" (${queryOptions.location || "Global"})`);

    // 1. AI Keyword Optimization Stage
    let originalKeyword = queryOptions.keyword;
    console.time("[TIME] AI Keyword Optimization");
    try {
      const optimized = await optimizeSearchKeywords(originalKeyword, model, baseUrl);
      if (optimized !== originalKeyword) {
        console.log(`[AI] Expanded Keywords: "${optimized}"`);
        queryOptions.keyword = optimized;
      }
    } catch (optError: any) {
      console.warn(`[WARN] Keyword Optimization Failed: ${optError.message}`);
    }
    console.timeEnd("[TIME] AI Keyword Optimization");

    // 2. LinkedIn Crawler Stage
    let allJobs: Job[] = [];
    console.time("[TIME] LinkedIn Job Crawl");
    try {
      const jobsResponse = await (linkedIn as any).query(queryOptions);
      if (Array.isArray(jobsResponse)) {
        allJobs = jobsResponse;
      } else {
        console.warn("[WARN] LinkedIn API returned non-array response:", typeof jobsResponse);
      }
    } catch (crawlError: any) {
      console.error(`[ERROR] LinkedIn Crawl ERROR: ${crawlError.message}`);
    }
    console.timeEnd("[TIME] LinkedIn Job Crawl");

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      console.log(`[DATA] Jobs Found: ${allJobs.length}. Starting AI Filtering...`);

      // 3. AI Filtering Stage
      console.time("[TIME] AI Goal & Filtering");
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
      console.timeEnd("[TIME] AI Goal & Filtering");
    } else {
      console.warn("[NONE] No jobs found from LinkedIn crawler.");
    }

    console.log(`[COMPLETE] Search finished. Top Picks: ${topPicks.length}`);
    res.json({
      allJobs,
      topPicks,
      aiError: aiErrorMessage,
    });
  } catch (error: any) {
    console.error("API Search Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle incoming search requests for Greenhouse boards.
 */
app.post("/api/greenhouse/search", async (req: Request, res: Response) => {
  try {
    const { boardId, keyword, model, baseUrl, goal } = req.body;
    console.log(`[START] API Greenhouse Search: "${keyword}" on board "${boardId}"`);

    // Fetch from greenhouse
    console.time("[TIME] Greenhouse Job Crawl");
    let allJobs: Job[] = [];
    try {
      const gRes = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs?content=true`);
      const rawJobs = gRes.data.jobs || [];

      const formatTimeAgo = (dateStr: string) => {
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
      console.error(`[ERROR] Greenhouse Crawl ERROR: ${crawlError.message}`);
      return res.status(500).json({ error: "Failed to fetch from Greenhouse" });
    }
    console.timeEnd("[TIME] Greenhouse Job Crawl");

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      console.log(`[DATA] Jobs Found: ${allJobs.length}. Starting AI Filtering...`);
      console.time("[TIME] AI Goal & Filtering");
      try {
        const { targetCountry } = req.body;
        let normalizedCountry = targetCountry;
        if (targetCountry) {
          normalizedCountry = await normalizeCountry(targetCountry, model, baseUrl);
        }
        const effectiveGoal = goal || (await generateGreenhouseJobGoal(keyword, normalizedCountry, model, baseUrl));

        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        console.error(`[ERROR] AI Processing ERROR: ${aiError.message}`);
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
      console.timeEnd("[TIME] AI Goal & Filtering");
    } else {
      console.warn("[NONE] No jobs found from Greenhouse API.");
    }

    console.log(`[COMPLETE] Greenhouse Search finished. Top Picks: ${topPicks.length}`);
    res.json({
      allJobs,
      topPicks,
      aiError: aiErrorMessage,
    });
  } catch (error: any) {
    console.error("API Greenhouse Search Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Perform a deep AI analysis on a specific Greenhouse job.
 */
app.post("/api/greenhouse/deep-analyze", async (req: Request, res: Response) => {
  try {
    const { content, searchGoal, model, baseUrl } = req.body;
    console.log(`[AI] [START] Deep Analysis session`);

    if (!content) {
      console.error(`[ERROR] Content missing for deep analysis.`);
      return res.status(400).json({ error: "Job content is missing." });
    }

    // Robust HTML decoding and tag stripping
    const cleanContent = cleanJobText(content);

    console.time("[TIME] AI Deep Analysis (Sequential)");

    // Pass 1: Summarize
    const summary = await summarizeJobRole(cleanContent, model, baseUrl);

    // Pass 2: Rate
    const rating = await rateJobCompatibility(cleanContent, searchGoal, model, baseUrl);

    // Pass 3: Culture & Benefits
    const cultureBenefits = await analyzeJobCultureAndBenefits(cleanContent, model, baseUrl);

    // Pass 4: Pros & Cons
    const prosCons = await analyzeJobProsAndCons(cleanContent, model, baseUrl);

    // Pass 5: Direct Quotes
    const quotes = await extractJobQuotes(cleanContent, model, baseUrl);

    console.timeEnd("[TIME] AI Deep Analysis (Sequential)");

    res.json({
      summary,
      score: rating.score,
      reasons: rating.reasons,
      culture: cultureBenefits,
      pros: prosCons.pros,
      cons: prosCons.cons,
      quotes: quotes,
    });
  } catch (error: any) {
    console.error("Deep Analyze Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated summary generation for reloading.
 */
app.post("/api/greenhouse/deep-summary", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Job content is missing." });

    // Robust HTML decoding and tag stripping
    const cleanContent = cleanJobText(content);
    console.log(`[AI] [RELOAD] Regenerating Executive Summary...`);
    const summary = await summarizeJobRole(cleanContent, model, baseUrl);
    res.json({ summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated rating generation.
 */
app.post("/api/greenhouse/deep-rating", async (req: Request, res: Response) => {
  try {
    const { content, searchGoal, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const cleanContent = cleanJobText(content);
    const rating = await rateJobCompatibility(cleanContent, searchGoal, model, baseUrl);
    res.json(rating);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated culture generation.
 */
app.post("/api/greenhouse/deep-culture", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const cleanContent = cleanJobText(content);
    const culture = await analyzeJobCultureAndBenefits(cleanContent, model, baseUrl);
    res.json({ culture });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated pros/cons generation.
 */
app.post("/api/greenhouse/deep-pros-cons", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const cleanContent = cleanJobText(content);
    const prosCons = await analyzeJobProsAndCons(cleanContent, model, baseUrl);
    res.json(prosCons);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated quotes generation.
 */
app.post("/api/greenhouse/deep-quotes", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const cleanContent = cleanJobText(content);
    const quotes = await extractJobQuotes(cleanContent, model, baseUrl);
    res.json({ quotes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Refresh search goal summary.
 */
app.post("/api/ai/goal/refresh", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl, isGreenhouse, keyword, targetCountry, ...clientOptions } = req.body;

    if (isGreenhouse) {
      const goal = await generateGreenhouseJobGoal(keyword, targetCountry, model, baseUrl);
      return res.json(goal);
    }

    const queryOptions = { ...getEffectiveQueryOptions(), ...clientOptions, keyword, targetCountry };
    const goal = await generateJobDescription(queryOptions, model, baseUrl);
    res.json(goal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * AI Diagnostic endpoint.
 */
app.post("/api/ai/diagnostics", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl } = req.body;
    console.log(`[AI] [DEBUG] Starting System Diagnostics for ${model}...`);
    const results = await runAiDiagnostics(model, baseUrl);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => res.send("Server is alive! [START]"));

// Serve the index.html for all non-API routes (SPA support)
app.get("*", (req: Request, res: Response) => {
  const indexPath = path.join(PUBLIC_PATH, "index.html");
  console.log(`[PAGE] Serving index.html from: ${indexPath}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`[ERROR] Error sending index.html:`, err);
      res.status(500).send("Error loading the page. Check server logs.");
    }
  });
});

// Start the server
app.listen(PORT, async () => {
  console.log(`\n[SERVER] Server is running on http://localhost:${PORT}`);
  console.log(`[WEB] Dashboard: http://localhost:${PORT}\n`);

  // Background warm-up
  console.log("[WARMUP] Initializing AI Warm-up sequence...");
  optimizeSearchKeywords("warmup", DEFAULT_AI_MODEL, DEFAULT_BASE_URL)
    .then(() => console.log("[DONE] AI Model is warm and ready!"))
    .catch((err) => console.warn("[WARN] Initial AI warm-up failed (Server may be offline)."));

  // Open browser to the UI
  open(`http://localhost:${PORT}`).catch((err) => console.error("Failed to open browser:", err));
});
