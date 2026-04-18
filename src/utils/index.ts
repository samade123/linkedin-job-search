// src/utils/index.ts

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
 * Cleans job text by removing extra whitespace, literal newlines,
 * and fixing broken spacing between characters.
 */
export function cleanJobText(text: string): string {
  if (!text) return "";
  // 1. Remove literal newlines and tabs
  let cleaned = text.replace(/[\\r\\n\\t]+/g, " ");
  // 3. Normalize multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}
