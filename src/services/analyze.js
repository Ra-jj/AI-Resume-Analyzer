/* global puter */
// The only module that talks to Puter. `puter` is the global created by the
// Puter.js script tag in index.html.
import {
  extractJson,
  getResponseText,
  normalizeAnalysis,
} from "../lib/analysis.js";
import { describeAiFailure, isFailedAiResponse } from "../lib/aiErrors.js";
import { AnalysisError } from "../lib/errors.js";
import { AI_TIMEOUT_MS, withTimeout } from "../lib/limits.js";
import { buildAnalysisMessages } from "../lib/prompt.js";

// Model ID as listed in Puter's AI model catalog. Pinned so every resume is
// reviewed by the same model instead of whatever Puter defaults to.
const AI_MODEL = "claude-sonnet-5-5";

// normalize: true asks Puter to return message.content as a plain string,
// whatever format the model replies in.
const AI_CHAT_OPTIONS = { model: AI_MODEL, normalize: true };

// An unreadable reply is asked for once more; rejections, timeouts and
// { success: false } failures are not.
const MAX_AI_ATTEMPTS = 2;

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

/**
 * An AnalysisError whose code says what Puter reported (usage limit, sign-in
 * closed, …). The failure can be a whole XMLHttpRequest, so the cause holds
 * only the fields read from it, which is what gets logged.
 */
function toAiRequestError(failure) {
  const { errorCode, ...details } = describeAiFailure(failure);
  return new AnalysisError(errorCode, { cause: details });
}

/**
 * One chat request with its own timeout. Throws an AnalysisError when the
 * request rejects, times out, or resolves with a { success: false } failure.
 */
async function sendChatRequest(messages) {
  let response;
  try {
    // Promise.resolve().then() turns a synchronous throw from puter into a
    // rejection. Fresh copies each time, in case the SDK mutates its input.
    response = await withTimeout(
      Promise.resolve().then(() =>
        puter.ai.chat(
          messages.map((message) => ({ ...message })),
          false,
          { ...AI_CHAT_OPTIONS },
        ),
      ),
      AI_TIMEOUT_MS,
      () => new AnalysisError("AI_TIMEOUT"),
    );
  } catch (err) {
    if (err instanceof AnalysisError) throw err;
    throw toAiRequestError(err);
  }
  // A resolved { success: false, error } is a failed request, not a reply
  // to read, so it is reported like a rejection and not asked for again.
  if (isFailedAiResponse(response)) throw toAiRequestError(response);
  return response;
}

/**
 * Sends the resume text (and the job description, when there is one) to the
 * AI and returns a normalized report. `jobMatch` is filled only when a job
 * description was sent.
 */
export async function requestAnalysis(resumeText, jobDescription = null) {
  const hasJobDescription =
    typeof jobDescription === "string" && jobDescription.length > 0;
  const messages = buildAnalysisMessages(
    resumeText,
    hasJobDescription ? jobDescription : null,
  );

  let readError;
  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    const response = await sendChatRequest(messages);

    let responseText;
    try {
      // Inside the try: serialising an unexpected reply can itself throw
      // (circular object, BigInt), and that is still an unreadable response.
      responseText = getResponseText(response);
      const analysis = normalizeAnalysis(extractJson(responseText));
      if (!hasJobDescription) return { ...analysis, jobMatch: null };
      if (!analysis.jobMatch) {
        console.warn(
          "[resume-analyzer] a job description was sent, but the AI response has no usable jobMatch. Showing the report without a job match.",
        );
      }
      return analysis;
    } catch (err) {
      readError = err;
      const rawResponse = responseText ?? response;
      if (attempt < MAX_AI_ATTEMPTS) {
        console.warn(
          `[resume-analyzer] could not read the AI response (attempt ${attempt} of ${MAX_AI_ATTEMPTS}); asking again. Raw response:`,
          rawResponse,
        );
      } else {
        console.error(
          `[resume-analyzer] could not read the AI response (attempt ${attempt} of ${MAX_AI_ATTEMPTS}). Raw response:`,
          rawResponse,
        );
      }
    }
  }
  throw new AnalysisError("AI_BAD_RESPONSE", { cause: readError });
}
