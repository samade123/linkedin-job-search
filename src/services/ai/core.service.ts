import axios from "axios";
import { DEFAULT_AI_MODEL, DEFAULT_AI_BASE_URL } from "../../config";

const DEFAULT_BASE_URL = DEFAULT_AI_BASE_URL;
export { DEFAULT_AI_MODEL, DEFAULT_BASE_URL };

// ---------------------------------------------------------------------------
// Global AI request queue
// ---------------------------------------------------------------------------
let _aiQueue: Promise<unknown> = Promise.resolve();

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = _aiQueue.then(fn, fn);
  _aiQueue = next.then(
    () => {},
    () => {},
  );
  return next;
}

// ---------------------------------------------------------------------------
// JSON repair + parse
//
// This model (OmniNeural-4B) consistently produces the same failure modes.
// We repair them all before attempting JSON.parse so that the validator
// receives a structurally valid object and can do semantic checks only.
//
// Failure modes handled, in repair order:
//   1. Markdown code fences        ```json ... ```
//   2. Split output                Two separate {...} blocks — extract first
//                                  or merge if keys are complementary
//   3. Single-quoted strings       'value' → "value"
//   4. Single-quoted keys          'key': → "key":
//   5. Unquoted keys               key: → "key":
//   6. Trailing commas             [a, b,] → [a, b]
//   7. Non-printable control chars (excluding \n \t \r)
// ---------------------------------------------------------------------------

/**
 * Extract the outermost JSON object or array from a string.
 * Returns the substring from the first { or [ to the matching closer.
 */
function _extractOuterJson(text: string): string {
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");

  let openChar: string;
  let closeChar: string;
  let start: number;

  if (firstBrace === -1 && firstBracket === -1) return text;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    openChar = "[";
    closeChar = "]";
    start = firstBracket;
  } else {
    openChar = "{";
    closeChar = "}";
    start = firstBrace;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === openChar) {
      depth++;
    }
    if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Unbalanced — return from start to end of string
  return text.slice(start);
}

/**
 * Attempt to merge two complementary top-level objects.
 * e.g. {"pro": [...]} and {"cons": [...]} → {"pro": [...], "cons": [...]}
 * Used when the model emits two separate JSON blocks instead of one.
 */
function _tryMergeSplitObjects(text: string): string | null {
  // Find all top-level {...} blocks
  const blocks: string[] = [];
  let remaining = text;
  while (true) {
    const idx = remaining.indexOf("{");
    if (idx === -1) break;
    const block = _extractOuterJson(remaining.slice(idx));
    if (!block || block === remaining.slice(idx)) {
      blocks.push(block);
      break;
    }
    blocks.push(block);
    remaining = remaining.slice(idx + block.length);
  }

  if (blocks.length < 2) return null;

  // Try to parse and merge the first two blocks
  try {
    // Repair each block minimally before trying to parse
    const a = JSON.parse(_repairSyntax(blocks[0]));
    const b = JSON.parse(_repairSyntax(blocks[1]));
    if (typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      return JSON.stringify({ ...a, ...b });
    }
  } catch {
    // Blocks individually unparseable — fall through
  }

  // Return the first block only as a last resort
  return blocks[0] ?? null;
}

/**
 * Apply syntax-level repairs to a JSON string.
 * Does NOT touch semantic content (key aliases handled separately).
 */
function _repairSyntax(text: string): string {
  let t = text.trim();

  // 1. Escape sequences in single-quoted strings are not handled here —
  //    single→double quote conversion must account for apostrophes in values.
  //    Strategy: replace single-quoted string literals carefully.
  //    Regex: a single-quoted string is ' followed by any chars (non-greedy)
  //    followed by '. We avoid converting apostrophes mid-word by requiring
  //    the opening ' to be preceded by : , [ { or whitespace.
  t = t.replace(/(?<=[:,\[{\s])\s*'((?:[^'\\]|\\.)*)'/g, (_, inner: string) => {
    // Escape any unescaped double quotes inside and wrap in double quotes
    return `"${inner.replace(/(?<!\\)"/g, '\\"')}"`;
  });

  // 2. Unquoted keys: word characters followed by colon not already quoted
  //    Match: start-of-value-position, then identifier, then colon
  //    Negative lookbehind for " prevents double-quoting already-quoted keys
  t = t.replace(/([{,\n\r]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, (match, pre, key, post) => {
    // Only quote if key is not already quoted
    if (pre.trimEnd().endsWith('"')) return match;
    return `${pre}"${key}"${post}`;
  });

  // 3. Trailing commas before ] or }
  t = t.replace(/,\s*([}\]])/g, "$1");

  // 4. Non-printable control characters (keep \n \t \r)
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return t;
}

/**
 * Full pipeline: strip fences → handle split output → repair syntax → parse.
 * Returns the parsed value or throws if all repair attempts fail.
 */
export function repairAndParse<T = unknown>(raw: string): T {
  let text = raw.trim();

  // Step 1: strip markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // Step 2: attempt direct parse (fast path — valid JSON needs no repair)
  try {
    return JSON.parse(text) as T;
  } catch {
    /* continue */
  }

  // Step 3: check for split output and attempt merge
  const merged = _tryMergeSplitObjects(text);
  if (merged) {
    try {
      return JSON.parse(merged) as T;
    } catch {
      /* continue */
    }
  }

  // Step 4: extract outer JSON boundary, repair syntax, parse
  const outer = _extractOuterJson(text);
  const repaired = _repairSyntax(outer);
  try {
    return JSON.parse(repaired) as T;
  } catch {
    /* continue */
  }

  // Step 5: repair the merged result too (if we have one)
  if (merged) {
    const repairedMerge = _repairSyntax(merged);
    try {
      return JSON.parse(repairedMerge) as T;
    } catch {
      /* continue */
    }
  }

  // All attempts exhausted — throw with the most-repaired form for logging
  throw new SyntaxError(`JSON repair failed. Most-repaired form: ${repaired}`);
}

/**
 * Legacy export — kept for call sites that use cleanJsonString directly.
 * New code should use repairAndParse instead.
 */
export function cleanJsonString(content: string): string {
  const text = content.trim();
  const outer = _extractOuterJson(text);
  return _repairSyntax(outer);
}

// ---------------------------------------------------------------------------
// Retry message sanitisation
// ---------------------------------------------------------------------------

const REPAIR_PHRASES = [
  "not valid JSON",
  "invalid JSON",
  "wrong structure",
  "Return ONLY the raw",
  "Return ONLY the corrected",
  "JSON repair",
];

function _isRepairRequest(content: string): boolean {
  const lower = content.toLowerCase();
  return REPAIR_PHRASES.some((p) => lower.includes(p.toLowerCase()));
}

export function stripBadAssistantTurns(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
  const cleaned = [...messages];

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = cleaned.length - 1; i >= 1; i--) {
      if (cleaned[i].role === "user" && _isRepairRequest(cleaned[i].content) && cleaned[i - 1].role === "assistant") {
        console.warn(`[RETRY] Stripping bad assistant turn at index ${i - 1} before retry`);
        cleaned.splice(i - 1, 2);
        changed = true;
        break;
      }
    }
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// AI call with JSON retry + optional schema validation
// ---------------------------------------------------------------------------

export async function callAiWithJsonRetry<T>(
  model: string,
  baseUrl: string,
  initialPayload: any,
  schemaDescription: string,
  isRetry: boolean = false,
  validator?: (parsed: T) => string | null,
): Promise<T | null> {
  try {
    const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const payloadWithModel = { ...initialPayload, model };

    const response = await enqueue(() =>
      axios.post(endpoint, payloadWithModel, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }),
    );

    if (response.status !== 200) return null;

    const content = response.data.choices[0].message.content.trim();
    console.log(`[AI] Response [${schemaDescription}]: ${content}`);

    let parsed: T;
    try {
      parsed = repairAndParse<T>(content);
      console.log(`[PARSE] Response [${schemaDescription}]: ${JSON.stringify(parsed)}`);
    } catch (parseError: any) {
      if (isRetry) {
        console.error(`[ERROR] AI failed to produce valid JSON even after retry. ` + `Last repair attempt: ${parseError.message}`);
        return null;
      }
      console.warn(`[WARN] AI produced malformed JSON (repair failed). ` + `Retrying ${schemaDescription}...`);
      return _retry<T>(
        model,
        baseUrl,
        initialPayload,
        schemaDescription,
        content,
        validator,
        `Your previous response was not valid JSON. ` +
          `Return ONLY the raw ${schemaDescription} — ` +
          `no markdown, no code fences, no text before or after the JSON. ` +
          `Use double quotes for all keys and string values.`,
      );
    }

    // Schema validation — key alias normalization happens inside the
    // validator before it decides whether to return an error, so that
    // "pro" → "pros" is a silent fix and does NOT trigger a retry.
    if (validator) {
      const validationError = validator(parsed);
      if (validationError) {
        if (isRetry) {
          console.error(`[ERROR] AI schema validation failed after retry: ${validationError}`);
          return null;
        }
        console.warn(`[WARN] AI schema invalid (${validationError}). Retrying...`);
        return _retry<T>(
          model,
          baseUrl,
          initialPayload,
          schemaDescription,
          content,
          validator,
          `Your previous response had the wrong structure: ${validationError}. ` +
            `Return ONLY the corrected ${schemaDescription} as raw JSON.`,
        );
      }
    }

    return parsed;
  } catch (err: any) {
    console.error(`[ERROR] AI Request Error: ${err.message}`);
    return null;
  }
}

async function _retry<T>(
  model: string,
  baseUrl: string,
  initialPayload: any,
  schemaDescription: string,
  previousContent: string,
  validator: ((parsed: T) => string | null) | undefined,
  retryMessage: string,
): Promise<T | null> {
  const cleanedMessages = stripBadAssistantTurns(initialPayload.messages ?? []);

  const retryPayload = {
    ...initialPayload,
    messages: [...cleanedMessages, { role: "user", content: retryMessage }],
  };

  console.warn(
    `[RETRY] Sending cleaned ${cleanedMessages.length + 1}-turn conversation ` + `(stripped bad assistant turn, appended correction)`,
  );

  return callAiWithJsonRetry<T>(model, baseUrl, retryPayload, schemaDescription, true, validator);
}
