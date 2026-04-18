import open from "open";
import { app } from "./src/app";
import { PORT, DEFAULT_AI_MODEL, DEFAULT_AI_BASE_URL as DEFAULT_BASE_URL } from "./src/config";
import { optimizeSearchKeywords } from "./src/services/ai";

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, async () => {
  console.log(`\n[SERVER] Server is running on http://localhost:${PORT}`);
  console.log(`[WEB] Dashboard: http://localhost:${PORT}\n`);

  console.log("[WARMUP] Initializing AI Warm-up sequence...");
  try {
    await optimizeSearchKeywords("warmup", DEFAULT_AI_MODEL, DEFAULT_BASE_URL);
    console.log("[DONE] AI Model is warm and ready!");
  } catch (err: any) {
    console.warn("[WARN] Initial AI warm-up failed — model server may be offline.", err.message);
  }

  open(`http://localhost:${PORT}`).catch((err) => console.error("Failed to open browser:", err));
});
