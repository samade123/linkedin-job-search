// server.ts
import express, { Request, Response } from "express";
import path from "path";
import axios from "axios";
import linkedIn from "linkedin-jobs-api";
import open from "open";

// Import modules
import { Job } from "./src/types";
import { getEffectiveQueryOptions } from "./src/args";
import { filterJobsWithAI, generateJobDescription, optimizeSearchKeywords, DEFAULT_AI_MODEL, DEFAULT_BASE_URL } from "./src/services/aiService";
import { PORT } from "./src/config";

const app = express();

// Middleware
app.use(express.json());
const PUBLIC_PATH = path.resolve(process.cwd(), "public");
app.use(express.static(PUBLIC_PATH));

console.log(`📁 Static files served from: ${PUBLIC_PATH}`);

/**
 * AI Warm-up endpoint to pre-load models.
 */
app.post("/api/warmup", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl } = req.body;
    console.log(`🔥 AI Warm-up Triggered (Target: ${model || DEFAULT_AI_MODEL})`);
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
    const response = await axios.get("http://127.0.0.1:18181/v1/models");
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
    const { model, ...clientOptions } = req.body;
    const queryOptions = { ...getEffectiveQueryOptions(), ...clientOptions };
    const searchGoal = await generateJobDescription(queryOptions, model);
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
    const { goal, model, baseUrl, ...clientOptions } = req.body;
    const queryOptions = { ...getEffectiveQueryOptions(), ...clientOptions };

    console.log(`🚀 [START] API Search: "${queryOptions.keyword}" (${queryOptions.location || 'Global'})`);

    // 1. AI Keyword Optimization Stage
    let originalKeyword = queryOptions.keyword;
    console.time("⏱️ AI Keyword Optimization");
    try {
      const optimized = await optimizeSearchKeywords(originalKeyword, model, baseUrl);
      if (optimized !== originalKeyword) {
        console.log(`✨ AI Expanded Keywords: "${optimized}"`);
        queryOptions.keyword = optimized;
      }
    } catch (optError: any) {
      console.warn(`⚠️ Keyword Optimization Failed: ${optError.message}`);
    }
    console.timeEnd("⏱️ AI Keyword Optimization");

    // 2. LinkedIn Crawler Stage
    let allJobs: Job[] = [];
    console.time("⏱️ LinkedIn Job Crawl");
    try {
      const jobsResponse = await (linkedIn as any).query(queryOptions);
      if (Array.isArray(jobsResponse)) {
        allJobs = jobsResponse;
      } else {
        console.warn("⚠️ LinkedIn API returned non-array response:", typeof jobsResponse);
      }
    } catch (crawlError: any) {
      console.error(`❌ LinkedIn Crawl ERROR: ${crawlError.message}`);
    }
    console.timeEnd("⏱️ LinkedIn Job Crawl");

    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (allJobs.length > 0) {
      console.log(`📦 Jobs Found: ${allJobs.length}. Starting AI Filtering...`);
      
      // 3. AI Filtering Stage
      console.time("⏱️ AI Goal & Filtering");
      try {
        const intentOptions = { ...queryOptions, keyword: originalKeyword };
        const effectiveGoal = goal || await generateJobDescription(intentOptions, model, baseUrl);

        const aiResult = await filterJobsWithAI(allJobs, effectiveGoal, model, baseUrl);
        topPicks = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
      } catch (aiError: any) {
        console.error(`❌ AI Processing ERROR: ${aiError.message}`);
        aiErrorMessage = `AI Error: ${aiError.message}`;
      }
      console.timeEnd("⏱️ AI Goal & Filtering");
    } else {
      console.warn("🚫 No jobs found from LinkedIn crawler.");
    }

    console.log(`✅ [COMPLETE] Search finished. Top Picks: ${topPicks.length}`);
    res.json({
      allJobs,
      topPicks,
      aiError: aiErrorMessage
    });

  } catch (error: any) {
    console.error("API Search Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => res.send("Server is alive! 🚀"));

// Serve the index.html for all non-API routes (SPA support)
app.get("*", (req: Request, res: Response) => {
  const indexPath = path.join(PUBLIC_PATH, "index.html");
  console.log(`📄 Serving index.html from: ${indexPath}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`❌ Error sending index.html:`, err);
      res.status(500).send("Error loading the page. Check server logs.");
    }
  });
});

// Start the server
app.listen(PORT, async () => {
    console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}\n`);
    
    // Background warm-up
    console.log("🔥 Initializing AI Warm-up sequence...");
    optimizeSearchKeywords("warmup", DEFAULT_AI_MODEL, DEFAULT_BASE_URL)
        .then(() => console.log("✨ AI Model is warm and ready!"))
        .catch(err => console.warn("⚠️ Initial AI warm-up failed (Server may be offline)."));

  // Open browser to the UI
  open(`http://localhost:${PORT}`).catch(err => console.error("Failed to open browser:", err));
});
