import { Job, QueryOptions } from "../../types";

export interface SearchGoal {
  summary: string;
  titles: string[];
  relatedTitles: string[];
}

export interface AiDiagnosticResult {
  totalAttempts: number;
  latencies: number[];
  healthSummary: string;
  status: "optimal" | "degraded" | "offline";
}
