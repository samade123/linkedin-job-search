import axios from "axios";
import { cleanJobText } from "../../utils";
import { enqueue, DEFAULT_AI_MODEL, DEFAULT_BASE_URL } from "./core.service";

/**
 * Rapidly optimizes a search keyword by expanding it into semantically
 * related professional terms.
 */
export async function optimizeSearchKeywords(
  keyword: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const payload = {
    messages: [
      {
        role: "system",
        content:
          "Fix typos in the user's keyword and expand to 3-4 professional search terms across any relevant industry. Space-separated only. No extra text.",
      },
      {
        role: "user",
        content: `Keyword: ${keyword}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 64,
  };

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payloadWithModel = { ...payload, model };
  let lastError: any;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await enqueue(() =>
        axios.post(endpoint, payloadWithModel, {
          headers: { "Content-Type": "application/json" },
          timeout: 4500,
        }),
      );

      const content = response.data.choices[0]?.message?.content?.trim();
      if (content) {
        return content
          .replace(/^(Here are|Optimized:)\s+/i, "")
          .replace(/[,.]/g, " ")
          .replace(/\s\s+/g, " ")
          .trim();
      }
    } catch (err: any) {
      lastError = err;
      if (attempt < 2) {
        console.log(`[RETRY] Retrying Keyword Optimization (Attempt ${attempt + 1})...`);
      }
    }
  }

  console.warn(`[WARN] Keyword Optimization Failed after 2 attempts: ${lastError?.message}`);
  throw lastError ?? new Error("Keyword optimization failed");
}

// ---------------------------------------------------------------------------
// Simple in-memory cache for country normalization.
// ---------------------------------------------------------------------------
const countryCache: Record<string, string> = {};
const countryInflight: Record<string, Promise<string>> = {};

/**
 * Normalizes a country name using AI.
 */
export async function normalizeCountry(
  country: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const safeCountry = String(country || "").trim();
  if (!safeCountry || safeCountry.toLowerCase() === "global" || safeCountry.toLowerCase() === "any") {
    return "Global";
  }

  if (countryCache[safeCountry]) {
    return countryCache[safeCountry];
  }

  if (countryInflight[safeCountry] !== undefined) {
    return countryInflight[safeCountry];
  }

  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;
  const safeModel = String(model || DEFAULT_AI_MODEL);

  const requestPayload = {
    messages: [
      {
        role: "system",
        content: "Return ONLY the formal English name of the country provided. No commentary.",
      },
      {
        role: "user",
        content: safeCountry,
      },
    ],
    temperature: 0,
    max_tokens: 20,
    model: safeModel,
  };

  const promise = enqueue(() =>
    axios.post(endpoint, requestPayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 8000,
    }),
  )
    .then((response) => {
      const content = response.data.choices[0]?.message?.content?.trim();
      if (content) {
        const formalized = content.replace(/^["']|["']$|\.$/g, "").trim();
        const isPlausible = formalized.length > 1 && formalized.length < 60 && /^[a-zA-Z\s\-'.]+$/.test(formalized);

        if (isPlausible) {
          countryCache[safeCountry] = formalized;
          return formalized;
        }
      }
      return safeCountry;
    })
    .catch((err: any) => {
      console.error(`[WARN] Country Normalization Failed: ${err.message}`);
      return safeCountry;
    })
    .finally(() => {
      delete countryInflight[safeCountry];
    });

  countryInflight[safeCountry] = promise;
  return promise;
}

/**
 * Extracts key functional sections from a job description.
 */
export function thinJobContent(text: string): string {
  if (!text) return "";

  let clean = cleanJobText(text);

  const patterns = [
    /responsibilit\w+/i,
    /requirement\w+/i,
    /qualification\w+/i,
    /skills?/i,
    /about the role/i,
    /what you\w+ do/i,
    /what we\w+ looking for/i,
  ];

  let matches: string[] = [];
  patterns.forEach((p) => {
    const match = clean.match(new RegExp(`${p.source}[\\s\\S]{1,1500}`, "i"));
    if (match) matches.push(match[0]);
  });

  if (matches.length === 0) {
    return clean.substring(0, 3000);
  }

  return matches.join("\n\n---\n\n").substring(0, 4000);
}
