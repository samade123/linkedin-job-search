import axios from "axios";
import { AiDiagnosticResult } from "./types";
import { enqueue, DEFAULT_AI_MODEL, DEFAULT_BASE_URL } from "./core.service";

/**
 * Runs a performance diagnostic on the AI model.
 */
export async function runAiDiagnostics(
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<AiDiagnosticResult> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const latencies: number[] = [];
  let totalAttempts = 0;

  for (let i = 1; i <= 5; i++) {
    totalAttempts = i;
    const start = Date.now();
    try {
      const response = await enqueue(() =>
        axios.post(
          endpoint,
          {
            model: model || DEFAULT_AI_MODEL,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
            temperature: 0,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 8000,
          },
        ),
      );

      if (response.status === 200) {
        latencies.push(Date.now() - start);
        break;
      }
    } catch (err: any) {
      latencies.push(-1);
      if (i === 5) {
        return {
          totalAttempts,
          latencies,
          healthSummary: "Connection timed out after 5 attempts.",
          status: "offline",
        };
      }
    }
  }

  try {
    const validLatencies = latencies.filter((l) => l > 0);
    const avgLatency = validLatencies.length ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) : 0;

    const summaryPayload = {
      model: model || DEFAULT_AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a system health agent. Analyze the provided latency data and attempt count. Summarize the model's performance in one professional sentence. No fluff.",
        },
        {
          role: "user",
          content: `Inference Probe Stats: Attempts: ${totalAttempts}, Avg Latency: ${avgLatency}ms. Status: Success at attempt ${totalAttempts}.`,
        },
      ],
      max_tokens: 100,
      temperature: 0.2,
    };

    const summaryRes = await enqueue(() =>
      axios.post(endpoint, summaryPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }),
    );

    const healthSummary = summaryRes.data.choices?.[0]?.message?.content?.trim() || "Analysis unavailable.";

    return {
      totalAttempts,
      latencies,
      healthSummary,
      status: avgLatency < 1500 ? "optimal" : "degraded",
    };
  } catch (err: any) {
    return {
      totalAttempts,
      latencies,
      healthSummary: "Probe succeeded but self-diagnostic summary failed.",
      status: "degraded",
    };
  }
}
