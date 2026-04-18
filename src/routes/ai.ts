import { Router, Request, Response } from "express";
import axios from "axios";
import { 
  optimizeSearchKeywords, 
  normalizeCountry, 
  generateJobDescription, 
  generateCompanyJobGoal, 
  runAiDiagnostics,
  DEFAULT_AI_MODEL,
  DEFAULT_BASE_URL
} from "../services/ai";
import { getEffectiveQueryOptions } from "../args";

const router = Router();

/**
 * AI Warm-up endpoint to pre-load models.
 */
router.post("/warmup", async (req: Request, res: Response) => {
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
router.get("/models", async (req: Request, res: Response) => {
  try {
    const modelsUrl = `${DEFAULT_BASE_URL.replace(/\/$/, "")}/models`;
    const response = await axios.get(modelsUrl);
    res.json(response.data);
  } catch (error: any) {
    console.warn("Failed to fetch models from local AI server:", error.message);
    res.json({
      data: [{ id: "NexaAI/OmniNeural-4B" }, { id: "NexaAI/Llama3.2-3B-NPU-Turbo" }],
    });
  }
});

/**
 * Endpoint for AI Search Goal generation.
 */
router.post("/goal", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl, targetCountry, ...clientOptions } = req.body;
    let normalizedCountry = targetCountry;
    if (targetCountry) {
      normalizedCountry = await normalizeCountry(targetCountry, model, baseUrl);
    }
    const queryOptions = {
      ...getEffectiveQueryOptions(),
      ...clientOptions,
      targetCountry: normalizedCountry,
    };
    const searchGoal = await generateJobDescription(queryOptions, model, baseUrl);
    res.json(searchGoal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Refresh search goal summary.
 */
router.post("/goal/refresh", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl, isGreenhouse, isAshby, keyword, targetCountry, ...clientOptions } = req.body;

    if (isGreenhouse || isAshby) {
      const platform = isGreenhouse ? "Greenhouse" : "Ashby";
      const goal = await generateCompanyJobGoal(keyword, platform, targetCountry, model, baseUrl);
      return res.json(goal);
    }

    const queryOptions = {
      ...getEffectiveQueryOptions(),
      ...clientOptions,
      keyword,
      targetCountry,
    };
    const goal = await generateJobDescription(queryOptions, model, baseUrl);
    res.json(goal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * AI Diagnostic endpoint.
 */
router.post("/diagnostics", async (req: Request, res: Response) => {
  try {
    const { model, baseUrl } = req.body;
    console.log(`[AI] [DEBUG] Starting System Diagnostics for ${model}...`);
    const results = await runAiDiagnostics(model, baseUrl);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
