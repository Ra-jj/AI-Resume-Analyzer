// Input limits for a single analysis. Kept in one place so the checks in
// App.jsx and the wording shown to the user can't drift apart.

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_PAGES = 10;

// Below this many non-whitespace characters there is nothing meaningful to
// analyze (for example, a PDF that contains only images).
export const MIN_TEXT_CHARACTERS = 50;

// Upper bound on resume text sent to the AI, to keep the prompt a sane size.
export const MAX_ANALYZED_CHARACTERS = 15000;

export const AI_TIMEOUT_MS = 120000;

// Upper bound on pdf.js parsing, so a file that never finishes can't leave
// the loading state up forever.
export const PDF_TIMEOUT_MS = 30000;

export function countNonWhitespaceCharacters(text) {
  return text.replace(/\s/g, "").length;
}

/**
 * pdf.js text items are joined with spaces, which leaves long runs of
 * spaces. Collapse them (keeping line breaks) so the character cap measures
 * real content rather than padding.
 */
export function collapseWhitespace(text) {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateForAnalysis(text) {
  if (text.length <= MAX_ANALYZED_CHARACTERS) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, MAX_ANALYZED_CHARACTERS), truncated: true };
}

/**
 * Rejects with createTimeoutError() if `promise` hasn't settled within `ms`.
 * The timer is always cleared so a settled request doesn't keep it alive.
 */
export function withTimeout(promise, ms, createTimeoutError) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(createTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}
