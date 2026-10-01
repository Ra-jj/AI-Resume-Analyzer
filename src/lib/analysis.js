// Pure helpers that turn the AI's free-form reply into the exact shape the
// dashboard renders. Nothing here touches the DOM, React or Puter.

const MAX_LIST_ITEMS = 10;

// "85", "85.5", "85%", "85/100", "8.5 / 10" — a number, optionally followed by
// a percent sign or a "/denominator".
const SCORE_PATTERN = /^([-+]?\d+(?:\.\d+)?)\s*(?:%|\/\s*(\d+(?:\.\d+)?))?$/;

/**
 * Pulls the reply text out of whatever puter.ai.chat resolved with. A string
 * is used as-is; otherwise message.content (string, or an array of text
 * parts), then .text, then the JSON-serialised value as a last resort.
 */
export function getResponseText(response) {
  if (typeof response === "string") return response;

  const content = response?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        return typeof part?.text === "string" ? part.text : "";
      })
      .join("");
    if (joined.trim()) return joined;
  }

  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text;
  }
  return JSON.stringify(response) ?? "";
}

function sliceOuterBraces(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return text;
  return text.slice(firstBrace, lastBrace + 1);
}

/**
 * Parses the JSON object out of an AI reply. Prefers the contents of a
 * ``` code fence; otherwise takes everything from the first "{" to the last
 * "}" so surrounding prose is ignored. Throws if no valid JSON is found.
 */
export function extractJson(text) {
  if (typeof text !== "string") {
    throw new TypeError(`extractJson expected a string, received ${typeof text}`);
  }
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch && fenceMatch[1] ? fenceMatch[1] : trimmed;
  return JSON.parse(sliceOuterBraces(candidate.trim()));
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Returns an integer 0–100, or null when the value isn't a usable score. */
function parseScore(value) {
  let score = Number.NaN;

  if (typeof value === "number") {
    score = value;
  } else if (typeof value === "string") {
    const match = value.trim().match(SCORE_PATTERN);
    if (match) {
      const [, numerator, denominator] = match;
      score =
        denominator === undefined
          ? Number(numerator)
          : (Number(numerator) / Number(denominator)) * 100;
    }
  }

  if (!Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function toText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, MAX_LIST_ITEMS);
}

const TRUTHY_STRINGS = new Set(["true", "yes", "y", "1", "pass", "passed"]);

/** true / 1 / "true" "yes" "y" "1" "pass" "passed" (any case) → true; anything else → false. */
function toBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return TRUTHY_STRINGS.has(value.trim().toLowerCase());
}

function toMetricList(value) {
  if (!Array.isArray(value)) return [];
  const metrics = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const name = toText(entry.name);
    const score = parseScore(entry.score);
    if (name && score !== null) metrics.push({ name, score });
    if (metrics.length === MAX_LIST_ITEMS) break;
  }
  return metrics;
}

function toChecklist(value) {
  if (!Array.isArray(value)) return [];
  const checklist = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const item = toText(entry.item);
    if (item) checklist.push({ item, passed: toBoolean(entry.passed) });
    if (checklist.length === MAX_LIST_ITEMS) break;
  }
  return checklist;
}

/**
 * Validates the parsed AI reply and returns an object with a guaranteed shape:
 * every field the dashboard reads is present and of the right type, scores
 * are integers clamped to 0–100, and lists hold at most 10 clean items.
 * Throws if `raw` isn't a plain object or has no usable overallScore — a
 * report without a score is a bad response, not something to show as 0.
 */
export function normalizeAnalysis(raw) {
  if (!isPlainObject(raw)) {
    const kind = raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw;
    throw new TypeError(`AI response must be a JSON object, received ${kind}`);
  }

  const overallScore = parseScore(raw.overallScore);
  if (overallScore === null) {
    throw new TypeError(
      `AI response has no usable overallScore (received ${JSON.stringify(raw.overallScore)})`,
    );
  }

  return {
    overallScore,
    executiveSummary: toText(raw.executiveSummary),
    topStrengths: toStringList(raw.topStrengths),
    mainImprovements: toStringList(raw.mainImprovements),
    performanceMetrics: toMetricList(raw.performanceMetrics),
    resumeInsights: toStringList(raw.resumeInsights),
    atsOptimization: toText(raw.atsOptimization),
    atsCompatibilityChecklist: toChecklist(raw.atsCompatibilityChecklist),
    recommendedKeywords: toStringList(raw.recommendedKeywords),
    recommendedRoles: toStringList(raw.recommendedRoles),
  };
}
