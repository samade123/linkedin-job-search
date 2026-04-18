import axios from "axios";
import { SearchGoal } from "./types";
import { thinJobContent } from "./utils.service";
import { enqueue, callAiWithJsonRetry, DEFAULT_AI_MODEL, DEFAULT_BASE_URL } from "./core.service";

export async function summarizeJobRole(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;

  const payload = {
    model: model || DEFAULT_AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an expert technical recruiter. Summarize the provided job description into a high-impact, professional summary of exactly 2-3 sentences focusing on primary responsibilities. No fluff.",
      },
      { role: "user", content: `Job Description: ${thinJobContent(description)}` },
    ],
    temperature: 0.1,
    max_tokens: 250,
  };

  try {
    const response = await enqueue(() =>
      axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );
    return response.data.choices?.[0]?.message?.content?.trim() || "Summary unavailable.";
  } catch {
    return "Failed to generate summary.";
  }
}

export async function rateJobCompatibility(
  description: string,
  searchGoal: SearchGoal,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ score: number; reasons: string[] }> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const safeDescription = thinJobContent(description);

  const payload = {
    messages: [
      {
        role: "system",
        content: `You are a job compatibility scorer. Compare the job description with the user's search intent.

Intent: "${searchGoal.summary}"

Output ONLY this JSON object — no markdown, no code fences, no text outside the braces:
{
  "score": 85,
  "reasons": ["Reason one.", "Reason two.", "Reason three."]
}

Rules:
- "score" must be an integer 0-100.
- "reasons" must be a JSON array of exactly 3 plain strings.
- Do not use single quotes, asterisks, or markdown in any string value.`,
      },
      { role: "user", content: `Job Description: ${safeDescription}` },
    ],
    temperature: 0.1,
    max_tokens: 200,
  };

  const validator = (p: { score: number; reasons: string[] }): string | null => {
    if (typeof p.score !== "number") return '"score" must be a number';
    if (!Array.isArray(p.reasons) || p.reasons.length === 0) return '"reasons" must be a non-empty array';
    return null;
  };

  const parsed = await callAiWithJsonRetry<{ score: number; reasons: string[] }>(
    model || DEFAULT_AI_MODEL,
    safeBaseUrl,
    payload,
    "Compatibility Rating JSON",
    false,
    validator,
  );

  if (parsed) {
    return {
      score: typeof parsed.score === "number" ? parsed.score : 0,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ["Analysis inconclusive."],
    };
  }
  return { score: 0, reasons: ["Failed to calculate compatibility."] };
}

export async function analyzeJobCultureAndBenefits(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${safeBaseUrl}/chat/completions`;

  const payload = {
    model: model || DEFAULT_AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a workplace culture analyst. Identify the benefits (perks, flexible work, etc.) and the company culture mentioned or implied in the job description. 2-3 sentences only. Plain text — no markdown, no asterisks, no bold.",
      },
      { role: "user", content: `Job Description: ${thinJobContent(description)}` },
    ],
    temperature: 0.2,
    max_tokens: 300,
  };

  try {
    const response = await enqueue(() =>
      axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );
    return response.data.choices?.[0]?.message?.content?.trim() || "Culture/Benefits data unavailable.";
  } catch {
    return "Failed to analyze culture and benefits.";
  }
}

// ---------------------------------------------------------------------------
// Pros/cons key alias map
//
// The model consistently produces aliased key names despite explicit
// instructions. These are normalized silently inside the validator so
// they never trigger a retry — retrying does not fix model vocabulary.
// ---------------------------------------------------------------------------

const PROS_KEY_ALIASES: Record<string, "pros"> = {
  pro: "pros",
  advantages: "pros",
  positives: "pros",
  strengths: "pros",
};

const CONS_KEY_ALIASES: Record<string, "cons"> = {
  con: "cons",
  disadvantages: "cons",
  negatives: "cons",
  weaknesses: "cons",
};

/**
 * Mutates `obj` in place, renaming any aliased pros/cons keys to their
 * canonical forms before validation runs.
 */
function normalizeProsConsKeys(obj: Record<string, unknown>): void {
  for (const [alias, canonical] of Object.entries(PROS_KEY_ALIASES)) {
    if (alias in obj && !(canonical in obj)) {
      obj[canonical] = obj[alias];
      delete obj[alias];
    }
  }
  for (const [alias, canonical] of Object.entries(CONS_KEY_ALIASES)) {
    if (alias in obj && !(canonical in obj)) {
      obj[canonical] = obj[alias];
      delete obj[alias];
    }
  }
}

export async function analyzeJobProsAndCons(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ pros: string[]; cons: string[] }> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const safeDescription = thinJobContent(description);

  const payload = {
    messages: [
      {
        role: "system",
        content: `Identify strategic Pros and Cons for this role.

Output ONLY this JSON object — no markdown, no code fences, no text outside the braces:
{
  "pros": ["Pro item one.", "Pro item two.", "Pro item three."],
  "cons": ["Con item one.", "Con item two.", "Con item three."]
}

Rules:
- The object must have exactly two keys: "pros" and "cons". Not "pro". Not "advantages".
- Each must be a JSON array of 2-4 plain strings.
- Do not use single quotes, asterisks, or markdown in any string value.`,
      },
      { role: "user", content: `Job Description: ${safeDescription}` },
    ],
    temperature: 0.1,
    max_tokens: 300,
  };

  const validator = (p: { pros: string[]; cons: string[] }): string | null => {
    // Cast for key mutation — normalizeProsConsKeys operates on the live
    // parsed object so callAiWithJsonRetry receives the corrected value.
    const obj = p as unknown as Record<string, unknown>;
    normalizeProsConsKeys(obj);

    // After normalization, both canonical keys must be present and non-empty.
    // These checks return an error only for genuinely unrecoverable failures
    // (completely absent keys, wrong types) — not for alias variants.
    if (!Array.isArray(obj["pros"]) || (obj["pros"] as unknown[]).length === 0) return 'key "pros" is missing or empty';
    if (!Array.isArray(obj["cons"]) || (obj["cons"] as unknown[]).length === 0) return 'key "cons" is missing or empty';
    return null;
  };

  const parsed = await callAiWithJsonRetry<{ pros: string[]; cons: string[] }>(
    model || DEFAULT_AI_MODEL,
    safeBaseUrl,
    payload,
    "Pros and Cons JSON",
    false,
    validator,
  );

  if (parsed) {
    return {
      pros: Array.isArray(parsed.pros) ? parsed.pros : ["Analysis inconclusive."],
      cons: Array.isArray(parsed.cons) ? parsed.cons : ["Analysis inconclusive."],
    };
  }
  return { pros: ["Failed to analyze pros."], cons: ["Failed to analyze cons."] };
}

export async function extractJobQuotes(
  description: string,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<string[]> {
  const safeBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const safeDescription = thinJobContent(description);

  const payload = {
    messages: [
      {
        role: "system",
        content: `Extract the 3 most significant direct quotes from the job description that reveal the role's seniority, culture, or unique demands.

Output ONLY a JSON array — no markdown, no code fences, no text outside the brackets:
["Quote one.", "Quote two.", "Quote three."]

Rules:
- The array must contain exactly 3 strings.
- Each string must be a direct quote from the job description.
- Use double quotes only. No single quotes, no asterisks.`,
      },
      { role: "user", content: `Job Description: ${safeDescription}` },
    ],
    temperature: 0.1,
    max_tokens: 200,
  };

  const validator = (p: string[]): string | null => {
    if (!Array.isArray(p)) return "response must be a JSON array";
    if (p.length === 0) return "array must not be empty";
    return null;
  };

  const parsed = await callAiWithJsonRetry<string[]>(
    model || DEFAULT_AI_MODEL,
    safeBaseUrl,
    payload,
    "Key Quotes JSON array",
    false,
    validator,
  );

  if (Array.isArray(parsed)) return parsed;
  return ["Failed to extract quotes."];
}
