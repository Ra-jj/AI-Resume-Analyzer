import { expect } from "@playwright/test";

// Served in place of https://js.puter.com/v2/. Defines the global `puter`
// with an ai.chat() that answers each call with the next planned reply (the
// last one repeats) and records each call's arguments on window.__puterCalls.
// The plan is set on window.__puterPlan by stubPuter() before the page loads.
const PUTER_STUB_SCRIPT = `
(() => {
  const replies = (window.__puterPlan && window.__puterPlan.replies) || [];
  const calls = [];
  const heldReplies = [];
  window.__puterCalls = calls;
  window.__puterHeldReplies = heldReplies;

  function toError(spec) {
    const error = new Error(spec.message);
    Object.assign(error, spec.fields || {});
    return error;
  }

  function chat(...args) {
    calls.push(JSON.parse(JSON.stringify(args)));
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if (!reply) {
      return Promise.reject(new Error("e2e Puter stub: no reply was planned"));
    }
    switch (reply.type) {
      case "resolve":
        return Promise.resolve(reply.value);
      case "reject":
        return Promise.reject(reply.value);
      case "rejectError":
        return Promise.reject(toError(reply.value));
      case "throw":
        throw toError(reply.value);
      case "never":
        return new Promise(() => {});
      case "held":
        return new Promise((resolve) => heldReplies.push(() => resolve(reply.value)));
      default:
        return Promise.reject(new Error("e2e Puter stub: unknown reply type " + reply.type));
    }
  }

  window.puter = { ai: { chat } };
})();
`;

/** An AI reply in the shape the app asks for, with every field filled. */
export function makeAnalysis(overrides = {}) {
  return {
    overallScore: 84,
    executiveSummary:
      "A focused backend engineer whose resume shows clear, measurable impact across payments and logistics.",
    topStrengths: [
      "Quantified results in most bullets",
      "Clear progression from junior to senior roles",
      "Relevant, modern technology stack",
    ],
    mainImprovements: [
      "Shorten the summary to two sentences",
      "Group skills by proficiency",
      "Add a link to a portfolio or blog",
    ],
    performanceMetrics: [
      { name: "Impact & Quantifiable Results", score: 88 },
      { name: "Brevity & Formatting", score: 76 },
      { name: "Action Verbs Usage", score: 82 },
      { name: "Grammar & Spelling", score: 95 },
    ],
    resumeInsights: [
      "Leadership is shown through mentoring outcomes",
      "Cloud migration work is a strong differentiator",
      "Open-source work adds credibility",
    ],
    atsOptimization: "Standard headings and a single-column layout should parse cleanly in most ATS.",
    atsCompatibilityChecklist: [
      { item: "Standard Section Headers", passed: true },
      { item: "No Complex Tables/Graphics", passed: true },
      { item: "Standard Font Usage", passed: true },
      { item: "Clear Contact Info", passed: false },
    ],
    recommendedKeywords: ["Distributed Systems", "gRPC", "SLOs", "Event Sourcing", "Terraform"],
    recommendedRoles: ["Senior Backend Engineer", "Staff Engineer", "Platform Engineer"],
    ...overrides,
  };
}

export function makeJobMatch(overrides = {}) {
  return {
    matchScore: 74,
    summary: "Strong backend fit; the posting's Rust and on-call leadership asks are not shown.",
    matchedKeywords: ["Go", "Kubernetes", "PostgreSQL"],
    missingKeywords: ["Rust", "Incident Commander"],
    ...overrides,
  };
}

/** Planned replies for the stubbed puter.ai.chat, one per call. */
export const replies = {
  /** Resolves with the analysis as JSON text, as `normalize: true` returns it. */
  analysis: (analysis = makeAnalysis()) => ({
    type: "resolve",
    value: { message: { role: "assistant", content: JSON.stringify(analysis) } },
  }),
  /** Resolves with message text that is not a usable analysis. */
  text: (content) => ({
    type: "resolve",
    value: { message: { role: "assistant", content } },
  }),
  /** Resolves with Puter's failure shape instead of a reply. */
  failedResponse: (error) => ({ type: "resolve", value: { success: false, error } }),
  /** Rejects with exactly this (JSON-serialisable) value. */
  rejection: (value) => ({ type: "reject", value }),
  /** Rejects with an Error that also carries `fields` (e.g. { code }). */
  errorRejection: (message, fields = {}) => ({
    type: "rejectError",
    value: { message, fields },
  }),
  /** Throws synchronously from puter.ai.chat. */
  synchronousThrow: (message, fields = {}) => ({ type: "throw", value: { message, fields } }),
  /** Never settles. */
  neverSettles: () => ({ type: "never" }),
  /** Resolves with the analysis only once releaseHeldReply() is called. */
  heldAnalysis: (analysis = makeAnalysis()) => ({
    type: "held",
    value: { message: { role: "assistant", content: JSON.stringify(analysis) } },
  }),
};

/**
 * Replaces the Puter script with the stub for this page. Call before
 * page.goto(). `plannedReplies` answer the 1st, 2nd, … chat call in order.
 */
export async function stubPuter(page, plannedReplies) {
  await page.addInitScript((plan) => {
    window.__puterPlan = plan;
  }, { replies: plannedReplies });
  await page.route("https://js.puter.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: PUTER_STUB_SCRIPT }),
  );
}

/**
 * The arguments of every puter.ai.chat call so far, oldest first. Null when
 * the stub isn't loaded in the page.
 */
export function getPuterCalls(page) {
  return page.evaluate(() => window.__puterCalls ?? null);
}

/** Waits for a held reply (replies.heldAnalysis) to be requested, then resolves it. */
export async function releaseHeldReply(page) {
  await expect
    .poll(() => page.evaluate(() => window.__puterHeldReplies?.length ?? 0))
    .toBeGreaterThan(0);
  await page.evaluate(() => window.__puterHeldReplies.shift()());
}

/** The resume text between the <resume> tags of a call's user message. */
export function resumeTextOf(messages) {
  const match = messages[1].content.match(/<resume>\n([\s\S]*)\n<\/resume>/);
  expect(match, "the user message has a <resume> block").not.toBeNull();
  return match[1];
}
