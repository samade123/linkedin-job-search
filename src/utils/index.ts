import { decode } from "html-entities";

/**
 * Escapes HTML characters for safe display.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Cleans job text for use in LLM prompts and display.
 *
 * Decodes HTML entities, strips tags, and normalises whitespace.
 * Must be applied to all content received from external ATS APIs
 * (Greenhouse, Lever, Workday, etc.) before it enters state, prompts,
 * or logs.
 */
export function cleanJobText(text: string): string {
  if (!text || typeof text !== "string") return "";

  // Step 1: Decode HTML entities (&lt; → < , &quot; → " , &amp; → & , etc.)
  const decoded = decode(text);

  // Step 2: Strip remaining HTML tags
  const stripped = decoded.replace(/<[^>]+>/g, " ");

  // Step 3: Normalise whitespace
  return stripped.replace(/\s+/g, " ").trim();
}

