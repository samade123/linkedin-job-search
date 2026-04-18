import express from "express";
import path from "path";

// Routes
import aiRoutes from "./routes/ai";
import searchRoutes from "./routes/search";
import boardRoutes from "./routes/boards";
import analysisRoutes from "./routes/analysis";

const app = express();

// Middleware
app.use(express.json());
const PUBLIC_PATH = path.resolve(process.cwd(), "client/dist");
app.use(express.static(PUBLIC_PATH));

// Route Registration
app.use("/api/ai", aiRoutes);
app.use("/api/search", searchRoutes);
app.use("/api", boardRoutes); // legacy /api/greenhouse/search etc.
app.use("/api/greenhouse", analysisRoutes); // legacy /api/greenhouse/deep-* routes
app.use("/api/goal", (req, res, next) => {
    // legacy shim for /api/goal
    req.url = "/goal";
    aiRoutes(req, res, next);
});
app.use("/api/models", (req, res, next) => {
    // legacy shim for /api/models
    req.url = "/models";
    aiRoutes(req, res, next);
});
app.use("/api/warmup", (req, res, next) => {
    // legacy shim for /api/warmup
    req.url = "/warmup";
    aiRoutes(req, res, next);
});

// Health check
app.get("/health", (_req, res) => res.send("Server is alive!"));

// SPA support
app.get("*", (req, res) => {
  const indexPath = path.join(PUBLIC_PATH, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) res.status(500).send("Error loading the page.");
  });
});

export { app, PUBLIC_PATH };
