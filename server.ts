// server.ts
import express, { Request, Response } from "express";
import path from "path";
import linkedIn from "linkedin-jobs-api";
import open from "open";

// Import modules
import { Job } from "./src/types";
import { getEffectiveQueryOptions } from "./src/args";
import { filterJobsWithAI, generateJobDescription } from "./src/services/aiService";
import { PORT } from "./src/config";

const app = express();

// Middleware
app.use(express.json());
const PUBLIC_PATH = path.resolve(process.cwd(), "public");
app.use(express.static(PUBLIC_PATH));

console.log(`📁 Static files served from: ${PUBLIC_PATH}`);

/**
 * Handle incoming search requests from the client.
 */
app.post("/api/search", async (req: Request, res: Response) => {
  try {
    const clientOptions = req.body;
    // Merge with defaults but prioritize client inputs
    const queryOptions = { ...getEffectiveQueryOptions(), ...clientOptions };

    console.log(`🚀 API Search Triggered: ${queryOptions.keyword} in ${queryOptions.location || 'Global'}`);

    // Parallel fetch: Jobs + AI Goal
    const [jobsResponse, searchGoal] = await Promise.all([
      (linkedIn as any).query(queryOptions),
      generateJobDescription(queryOptions)
    ]);

    let allJobs: Job[] = [];
    let topPicks: Job[] = [];
    let aiErrorMessage = "";

    if (Array.isArray(jobsResponse)) {
      allJobs = jobsResponse;
      console.log(`Fetch completed. Found ${allJobs.length} jobs.`);
      
      const aiResult = await filterJobsWithAI(allJobs, searchGoal);
      topPicks = aiResult.filteredJobs;
      aiErrorMessage = aiResult.errorMessage;
      
      console.log(`AI Filtering complete. Selected ${topPicks.length} top picks.`);
    }

    res.json({
      allJobs,
      topPicks,
      goal: searchGoal,
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
app.listen(PORT, () => {
  console.log(`
  🚀 LinkedIn Job Hunter API is active!
  🌐 Access the UI at: http://localhost:${PORT}
  `);

  // Open browser to the UI
  open(`http://localhost:${PORT}`).catch(err => console.error("Failed to open browser:", err));
});
