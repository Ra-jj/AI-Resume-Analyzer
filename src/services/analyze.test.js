import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisError } from "../lib/errors.js";
import { AI_TIMEOUT_MS } from "../lib/limits.js";
import { buildAnalysisMessages } from "../lib/prompt.js";
import { isAiServiceAvailable, requestAnalysis } from "./analyze.js";

const GOOD_REPLY = JSON.stringify({
  overallScore: 77,
  executiveSummary: "ok",
  jobMatch: { matchScore: 64, summary: "s", matchedKeywords: ["Go"], missingKeywords: ["Rust"] },
});
const UNREADABLE_REPLY = "Sorry, I can't help with that.";

/**
 * Installs a fake `puter` global whose chat() plays back `replies` in order,
 * repeating the last one. A function reply is called with the chat arguments
 * (to reject, throw or hang); anything else resolves as-is. Never touches the
 * real Puter API.
 */
function stubPuterChat(...replies) {
  let callIndex = 0;
  const chat = vi.fn((...args) => {
    const reply = replies[Math.min(callIndex, replies.length - 1)];
    callIndex += 1;
    return typeof reply === "function" ? reply(...args) : Promise.resolve(reply);
  });
  vi.stubGlobal("puter", { ai: { chat } });
  return chat;
}

/** Waits for `promise` to reject and returns the AnalysisError it rejected with. */
async function expectAnalysisError(promise) {
  const error = await promise.then(
    () => {
      throw new Error("expected requestAnalysis to reject");
    },
    (rejection) => rejection,
  );
  expect(error).toBeInstanceOf(AnalysisError);
  return error;
}

/** A reply getResponseText can't serialise (it is circular). */
function resolveCircularReply() {
  const reply = { message: {} };
  reply.message.content = reply;
  return Promise.resolve(reply);
}

let warnSpy;
let errorSpy;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestAnalysis: the request", () => {
  it("calls puter.ai.chat(messages, false, { model: 'claude-sonnet-5-5', normalize: true })", async () => {
    const chat = stubPuterChat(GOOD_REPLY);
    await requestAnalysis("RESUME TEXT");

    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledWith(buildAnalysisMessages("RESUME TEXT", null), false, {
      model: "claude-sonnet-5-5",
      normalize: true,
    });
    expect(chat.mock.calls[0]).toHaveLength(3);
  });

  it("sends no temperature, max_tokens or response_format", async () => {
    const chat = stubPuterChat(GOOD_REPLY);
    await requestAnalysis("R", "JD");
    expect(JSON.stringify(chat.mock.calls[0])).not.toMatch(/temperature|max_?tokens|maxTokens|response_format/i);
  });

  it("sends the job description when there is one", async () => {
    const chat = stubPuterChat(GOOD_REPLY);
    await requestAnalysis("RESUME", "JD TEXT");
    expect(chat.mock.calls[0][0]).toEqual(buildAnalysisMessages("RESUME", "JD TEXT"));
  });

  it.each([
    ["an empty string", ""],
    ["undefined", undefined],
    ["null", null],
    ["a non-string", 42],
  ])("treats %s as no job description", async (_label, jobDescription) => {
    const chat = stubPuterChat(GOOD_REPLY);
    const report = await requestAnalysis("R", jobDescription);
    expect(chat.mock.calls[0][0]).toEqual(buildAnalysisMessages("R", null));
    expect(report.jobMatch).toBeNull();
  });
});

describe("requestAnalysis: reading the reply", () => {
  it("returns the normalized report and drops a jobMatch nobody asked for", async () => {
    stubPuterChat(GOOD_REPLY);
    const report = await requestAnalysis("R");
    expect(report.overallScore).toBe(77);
    expect(report.executiveSummary).toBe("ok");
    expect(report.jobMatch).toBeNull();
  });

  it("returns the normalized jobMatch when a job description was sent", async () => {
    stubPuterChat(GOOD_REPLY);
    const report = await requestAnalysis("R", "JD");
    expect(report.jobMatch).toEqual({ matchScore: 64, summary: "s", matchedKeywords: ["Go"], missingKeywords: ["Rust"] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", JSON.stringify({ overallScore: 70 })],
    ["unusable", JSON.stringify({ overallScore: 70, jobMatch: { matchScore: "high" } })],
  ])("shows the report without a %s jobMatch, warns once and does not ask again", async (_label, reply) => {
    const chat = stubPuterChat(reply);
    const report = await requestAnalysis("R", "JD");
    expect(report.overallScore).toBe(70);
    expect(report.jobMatch).toBeNull();
    expect(chat).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("no usable jobMatch");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["message.content", { message: { content: GOOD_REPLY } }],
    ["a content array", { message: { content: [{ type: "text", text: GOOD_REPLY }] } }],
    ["{ success: true, message }", { success: true, message: { content: GOOD_REPLY } }],
    ["a fenced reply", `Here you go:\n\`\`\`json\n${GOOD_REPLY}\n\`\`\``],
  ])("reads a reply shaped as %s in one call", async (_label, reply) => {
    const chat = stubPuterChat(reply);
    expect((await requestAnalysis("R")).overallScore).toBe(77);
    expect(chat).toHaveBeenCalledTimes(1);
  });
});

describe("requestAnalysis: retrying an unreadable reply", () => {
  it("asks once more after an unreadable reply and uses the second one", async () => {
    const chat = stubPuterChat(UNREADABLE_REPLY, GOOD_REPLY);
    const report = await requestAnalysis("R");

    expect(report.overallScore).toBe(77);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("attempt 1 of 2");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("sends identical, freshly copied messages and options on the retry", async () => {
    const chat = stubPuterChat(UNREADABLE_REPLY, GOOD_REPLY);
    await requestAnalysis("R", "JD");
    const [first, second] = chat.mock.calls;

    expect(second).toEqual(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0][0]).not.toBe(first[0][0]);
    expect(second[2]).not.toBe(first[2]);
  });

  it("is not affected by the SDK mutating the messages it was given", async () => {
    const mutateThenFail = (messages, _testMode, options) => {
      messages[1].content = "MUTATED";
      options.model = "MUTATED";
      return Promise.resolve(UNREADABLE_REPLY);
    };
    const chat = stubPuterChat(mutateThenFail, GOOD_REPLY);
    await requestAnalysis("R");
    expect(chat.mock.calls[1][0]).toEqual(buildAnalysisMessages("R", null));
    expect(chat.mock.calls[1][2]).toEqual({ model: "claude-sonnet-5-5", normalize: true });
  });

  it.each([
    ["not JSON twice", UNREADABLE_REPLY, "not json"],
    ["no usable overallScore twice", JSON.stringify({ overallScore: "excellent" }), JSON.stringify({ overallScore: null })],
    ["{ success: 'false' } twice (not Puter's failure shape)", { success: "false" }, { success: "false" }],
    ["an error object without success: false twice", { error: { code: "insufficient_funds" } }, { error: { code: "insufficient_funds" } }],
    ["a reply that can't be serialised, then not JSON", resolveCircularReply, "nope"],
  ])("fails with AI_BAD_RESPONSE after exactly 2 calls for %s", async (_label, firstReply, secondReply) => {
    const chat = stubPuterChat(firstReply, secondReply, GOOD_REPLY);
    const error = await expectAnalysisError(requestAnalysis("R"));

    expect(error.code).toBe("AI_BAD_RESPONSE");
    expect(chat).toHaveBeenCalledTimes(2);
    expect(error.cause).toBeInstanceOf(Error);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("attempt 2 of 2");
  });
});

describe("requestAnalysis: failed requests are not retried", () => {
  it.each([
    ["{ status: 401 }", () => Promise.reject({ status: 401, message: "Unauthorized" }), "AI_AUTH", { code: null, status: 401, message: "Unauthorized", usageLimited: false }],
    ["{ error: { code: insufficient_funds } }", () => Promise.reject({ error: { code: "insufficient_funds" } }), "AI_USAGE_LIMIT", { code: "insufficient_funds", status: null, message: null, usageLimited: false }],
    ["{ code: popup_blocked }", () => Promise.reject({ code: "popup_blocked" }), "AI_POPUP_BLOCKED", { code: "popup_blocked" }],
    ["{ code: auth_window_closed }", () => Promise.reject({ code: "auth_window_closed" }), "AI_SIGN_IN_CLOSED", { code: "auth_window_closed" }],
    ["an Error", () => Promise.reject(new Error("Network down")), "AI_FAILED", { message: "Network down" }],
    ["a synchronous throw", () => { throw "kaboom"; }, "AI_FAILED", { message: "kaboom" }],
  ])("maps a rejection (%s) after 1 call", async (_label, reply, code, cause) => {
    const chat = stubPuterChat(reply, GOOD_REPLY);
    const error = await expectAnalysisError(requestAnalysis("R"));

    expect(error.code).toBe(code);
    expect(error.cause).toMatchObject(cause);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("logs only the extracted fields of an XMLHttpRequest rejection", async () => {
    const xhr = { readyState: 4, status: 401, statusText: "Unauthorized", responseText: "<html/>", secret: "SECRET" };
    stubPuterChat(() => Promise.reject(xhr));
    const error = await expectAnalysisError(requestAnalysis("R"));

    expect(error.code).toBe("AI_AUTH");
    expect(error.cause).toEqual({ code: null, status: 401, message: "Unauthorized", usageLimited: false });
    expect(JSON.stringify(error.cause)).not.toContain("SECRET");
  });

  it.each([
    ["{ error: { code: insufficient_funds } }", { success: false, error: { code: "insufficient_funds", message: "Insufficient funds" } }, "AI_USAGE_LIMIT"],
    ["{ error: 'usage_limited' }", { success: false, error: "usage_limited" }, "AI_USAGE_LIMIT"],
    ["{ error: { code: popup_blocked } }", { success: false, error: { code: "popup_blocked" } }, "AI_POPUP_BLOCKED"],
    ["{ status: 401 }", { success: false, status: 401 }, "AI_AUTH"],
    ["nothing else", { success: false }, "AI_FAILED"],
    ["{ error: 'Something broke' }", { success: false, error: "Something broke" }, "AI_FAILED"],
  ])("maps a resolved { success: false } with %s after 1 call", async (_label, reply, code) => {
    const chat = stubPuterChat(reply, GOOD_REPLY);
    const error = await expectAnalysisError(requestAnalysis("R"));

    expect(error.code).toBe(code);
    expect(chat).toHaveBeenCalledTimes(1);
    for (const value of Object.values(error.cause)) {
      expect(value === null || ["string", "number", "boolean"].includes(typeof value)).toBe(true);
    }
  });

  it("maps a reply whose then-check throws (the promise rejects) as a failed request", async () => {
    const throwingReply = new Proxy({}, {
      get() {
        throw new Error("boom");
      },
    });
    const chat = stubPuterChat(() => Promise.resolve(throwingReply), GOOD_REPLY);
    const error = await expectAnalysisError(requestAnalysis("R"));

    expect(error.code).toBe("AI_FAILED");
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a rejection", () => Promise.reject({ code: "popup_blocked" }), "AI_POPUP_BLOCKED"],
    ["a resolved usage failure", { success: false, error: { code: "insufficient_funds" } }, "AI_USAGE_LIMIT"],
  ])("stops at %s on the retry: its code, 2 calls, no third", async (_label, secondReply, code) => {
    const chat = stubPuterChat(UNREADABLE_REPLY, secondReply, GOOD_REPLY);
    const error = await expectAnalysisError(requestAnalysis("R"));

    expect(error.code).toBe(code);
    expect(chat).toHaveBeenCalledTimes(2);
  });
});

describe("requestAnalysis: timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** Records how a promise settles without awaiting it. */
  function track(promise) {
    const state = { settled: false, error: undefined };
    promise.then(
      () => Object.assign(state, { settled: true }),
      (error) => Object.assign(state, { settled: true, error }),
    );
    return state;
  }

  it("fails with AI_TIMEOUT when the AI doesn't answer within the limit, without retrying", async () => {
    const chat = stubPuterChat(() => new Promise(() => {}), GOOD_REPLY);
    const state = track(requestAnalysis("R"));

    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    expect(state.error).toBeInstanceOf(AnalysisError);
    expect(state.error.code).toBe("AI_TIMEOUT");

    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("gives the retry its own full time limit, counted from when it is sent", async () => {
    const slowUnreadable = () =>
      new Promise((resolve) => setTimeout(() => resolve(UNREADABLE_REPLY), AI_TIMEOUT_MS / 2));
    const chat = stubPuterChat(slowUnreadable, () => new Promise(() => {}), GOOD_REPLY);
    const state = track(requestAnalysis("R"));

    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS / 2);
    expect(chat).toHaveBeenCalledTimes(2);
    // A deadline shared with the first attempt would fire during this wait,
    // half-way through the retry.
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.error?.code).toBe("AI_TIMEOUT");
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("leaves no timer running after a reply", async () => {
    stubPuterChat(GOOD_REPLY);
    await requestAnalysis("R");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("isAiServiceAvailable", () => {
  it("is true when puter.ai.chat is a function", () => {
    stubPuterChat(GOOD_REPLY);
    expect(isAiServiceAvailable()).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("is false, and logs, when the Puter script never loaded", () => {
    expect(globalThis.puter).toBeUndefined();
    expect(isAiServiceAvailable()).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]).toContain("undefined");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an object without ai", {}],
    ["ai without chat", { ai: {} }],
    ["chat that is not a function", { ai: { chat: "nope" } }],
  ])("is false when puter is %s", (_label, value) => {
    vi.stubGlobal("puter", value);
    expect(isAiServiceAvailable()).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
