/* global puter */
// The only module that talks to Puter. `puter` is the global created by the
// Puter.js script tag in index.html.
import {
  extractJson,
  getResponseText,
  normalizeAnalysis,
} from "../lib/analysis.js";
import { AnalysisError } from "../lib/errors.js";
import { AI_TIMEOUT_MS, withTimeout } from "../lib/limits.js";

// The prompt wording is intentionally unchanged from the original version.
function buildAnalysisPrompt(resumeText) {
  return `
        You are a world-class Executive Resume Writer and ATS Expert.
        I will provide a RESUME. You must analyze this resume comprehensively.
        Do not compare it to a job description. Analyze its absolute quality, impact, and ATS readability.
        
        You must return the result STRICTLY as a valid JSON object. Do not include any markdown formatting like code blocks. Just return the raw JSON object.
        
        The JSON object must have this EXACT structure:
        {
          "overallScore": <number between 0 and 100>,
          "executiveSummary": "<A brief 2-3 sentence summary of the resume's overall impact>",
          "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
          "mainImprovements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
          "performanceMetrics": [
            { "name": "Impact & Quantifiable Results", "score": <number 0-100> },
            { "name": "Brevity & Formatting", "score": <number 0-100> },
            { "name": "Action Verbs Usage", "score": <number 0-100> },
            { "name": "Grammar & Spelling", "score": <number 0-100> }
          ],
          "resumeInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
          "atsOptimization": "<A short paragraph summarizing how well this parses in an ATS>",
          "atsCompatibilityChecklist": [
            { "item": "Standard Section Headers", "passed": <boolean> },
            { "item": "No Complex Tables/Graphics", "passed": <boolean> },
            { "item": "Standard Font Usage", "passed": <boolean> },
            { "item": "Clear Contact Info", "passed": <boolean> }
          ],
          "recommendedKeywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>"],
          "recommendedRoles": ["<role 1>", "<role 2>", "<role 3>"]
        }

        RESUME:
        ${resumeText}
      `;
}

/**
 * True when the Puter script has loaded and exposes puter.ai.chat. When it
 * hasn't, logs what was found, since the message shown to the user can't.
 */
export function isAiServiceAvailable() {
  const isAvailable =
    typeof puter !== "undefined" && typeof puter?.ai?.chat === "function";
  if (!isAvailable) {
    console.error(
      "[resume-analyzer] puter.ai.chat is not available; typeof puter =",
      typeof puter,
    );
  }
  return isAvailable;
}

/** Sends the resume text to the AI and returns a normalized report. */
export async function requestAnalysis(resumeText) {
  let response;
  try {
    // Promise.resolve().then() turns a synchronous throw from puter into a rejection.
    response = await withTimeout(
      Promise.resolve().then(() => puter.ai.chat(buildAnalysisPrompt(resumeText))),
      AI_TIMEOUT_MS,
      () => new AnalysisError("AI_TIMEOUT"),
    );
  } catch (err) {
    if (err instanceof AnalysisError) throw err;
    throw new AnalysisError("AI_FAILED", { cause: err });
  }

  let responseText;
  try {
    // Inside the try: serialising an unexpected reply can itself throw
    // (circular object, BigInt), and that is still an unreadable response.
    responseText = getResponseText(response);
    return normalizeAnalysis(extractJson(responseText));
  } catch (err) {
    console.error(
      "[resume-analyzer] could not read the AI response. Raw response:",
      responseText ?? response,
    );
    throw new AnalysisError("AI_BAD_RESPONSE", { cause: err });
  }
}
