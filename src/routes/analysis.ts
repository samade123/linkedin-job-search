import { Router, Request, Response } from "express";
import { 
  summarizeJobRole, 
  rateJobCompatibility, 
  analyzeJobCultureAndBenefits, 
  analyzeJobProsAndCons, 
  extractJobQuotes 
} from "../services/ai";
import { cleanJobText } from "../utils";

const router = Router();

/**
 * Deep AI Analysis session
 */
router.post("/deep-analyze", async (req: Request, res: Response) => {
  try {
    const { content, searchGoal, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Job content is missing." });

    const cleanContent = cleanJobText(content);
    const summary = await summarizeJobRole(cleanContent, model, baseUrl);
    const rating = await rateJobCompatibility(cleanContent, searchGoal, model, baseUrl);
    const cultureBenefits = await analyzeJobCultureAndBenefits(cleanContent, model, baseUrl);
    const prosCons = await analyzeJobProsAndCons(cleanContent, model, baseUrl);
    const quotes = await extractJobQuotes(cleanContent, model, baseUrl);

    res.json({
      summary,
      score: rating.score,
      reasons: rating.reasons,
      culture: cultureBenefits,
      pros: prosCons.pros,
      cons: prosCons.cons,
      quotes,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated summary generation
 */
router.post("/deep-summary", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Job content is missing." });
    const summary = await summarizeJobRole(cleanJobText(content), model, baseUrl);
    res.json({ summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated rating generation
 */
router.post("/deep-rating", async (req: Request, res: Response) => {
  try {
    const { content, searchGoal, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const rating = await rateJobCompatibility(cleanJobText(content), searchGoal, model, baseUrl);
    res.json(rating);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated culture generation
 */
router.post("/deep-culture", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const culture = await analyzeJobCultureAndBenefits(cleanJobText(content), model, baseUrl);
    res.json({ culture });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated pros/cons generation
 */
router.post("/deep-pros-cons", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const prosCons = await analyzeJobProsAndCons(cleanJobText(content), model, baseUrl);
    res.json(prosCons);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Isolated quotes generation
 */
router.post("/deep-quotes", async (req: Request, res: Response) => {
  try {
    const { content, model, baseUrl } = req.body;
    if (!content) return res.status(400).json({ error: "Content missing" });
    const quotes = await extractJobQuotes(cleanJobText(content), model, baseUrl);
    res.json({ quotes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
