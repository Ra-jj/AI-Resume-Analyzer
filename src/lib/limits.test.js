import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_TIMEOUT_MS,
  MAX_ANALYZED_CHARACTERS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  MAX_JOB_DESCRIPTION_CHARACTERS,
  MAX_PAGES,
  MIN_JOB_DESCRIPTION_CHARACTERS,
  MIN_TEXT_CHARACTERS,
  PDF_TIMEOUT_MS,
  collapseWhitespace,
  countNonWhitespaceCharacters,
  prepareJobDescription,
  truncateForAnalysis,
  withTimeout,
} from "./limits.js";

describe("limits", () => {
  it("has the documented values", () => {
    expect(MAX_FILE_SIZE_MB).toBe(10);
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PAGES).toBe(10);
    expect(MIN_TEXT_CHARACTERS).toBe(50);
    expect(MAX_ANALYZED_CHARACTERS).toBe(15000);
    expect(MAX_JOB_DESCRIPTION_CHARACTERS).toBe(5000);
    expect(MIN_JOB_DESCRIPTION_CHARACTERS).toBe(100);
    expect(AI_TIMEOUT_MS).toBe(120000);
    expect(PDF_TIMEOUT_MS).toBe(30000);
  });
});

describe("countNonWhitespaceCharacters", () => {
  it.each([
    ["  a b\n\tc  ", 3],
    [" a\tb\nc d e ", 5],
    ["", 0],
    [" \n\t\r ", 0],
    ["abc", 3],
  ])("%j -> %i", (text, expected) => {
    expect(countNonWhitespaceCharacters(text)).toBe(expected);
  });
});

describe("collapseWhitespace", () => {
  it.each([
    ["  Jane   Doe \t Engineer  \n\n\n\n  Skills :  JS  ", "Jane Doe Engineer\n\nSkills : JS"],
    ["  a   b \n\n\n\n  c \t d  e  \r\n f  ", "a b\n\nc d e\nf"],
    ["one\ntwo", "one\ntwo"],
    ["one\n\ntwo", "one\n\ntwo"],
    ["one\n \n \n two", "one\n\ntwo"],
    ["   ", ""],
    ["", ""],
  ])("%j -> %j", (text, expected) => {
    expect(collapseWhitespace(text)).toBe(expected);
  });
});

describe("truncateForAnalysis", () => {
  it("keeps text of exactly 15,000 characters whole", () => {
    const text = "a".repeat(15000);
    expect(truncateForAnalysis(text)).toEqual({ text, truncated: false });
  });

  it("cuts 15,001 characters to 15,000 and flags it", () => {
    const result = truncateForAnalysis(`${"b".repeat(15000)}c`);
    expect(result.text).toBe("b".repeat(15000));
    expect(result.truncated).toBe(true);
  });

  it("leaves short text and empty text alone", () => {
    expect(truncateForAnalysis("short")).toEqual({ text: "short", truncated: false });
    expect(truncateForAnalysis("")).toEqual({ text: "", truncated: false });
  });
});

describe("prepareJobDescription", () => {
  it.each([
    ["an empty string", ""],
    ["whitespace", "   \n\t "],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
  ])("treats %s as no job description", (_label, input) => {
    expect(prepareJobDescription(input)).toEqual({ text: null, isTooShort: false });
  });

  it("counts only non-whitespace characters towards the 100 minimum", () => {
    expect(prepareJobDescription("a".repeat(99)).isTooShort).toBe(true);
    expect(prepareJobDescription("a".repeat(100)).isTooShort).toBe(false);
    expect(prepareJobDescription(`ab ${" ".repeat(40)}`.repeat(49)).isTooShort).toBe(true);
  });

  it("caps the text at 5,000 characters", () => {
    expect(prepareJobDescription("x".repeat(6000)).text).toHaveLength(5000);
  });

  it("collapses whitespace but keeps paragraph breaks", () => {
    const { text, isTooShort } = prepareJobDescription(
      `  Role:   Backend\n\n\n\nGo   and  Kafka  ${"z".repeat(100)}`,
    );
    expect(text).toBe(`Role: Backend\n\nGo and Kafka ${"z".repeat(100)}`);
    expect(isTooShort).toBe(false);
  });
});

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Records how a promise settles without awaiting it. */
  function track(promise) {
    const state = { settled: false, value: undefined, error: undefined };
    promise.then(
      (value) => Object.assign(state, { settled: true, value }),
      (error) => Object.assign(state, { settled: true, error }),
    );
    return state;
  }

  it("rejects with the timeout error exactly at the deadline, not before", async () => {
    const timeoutError = new Error("timed out");
    const createTimeoutError = vi.fn(() => timeoutError);
    const state = track(withTimeout(new Promise(() => {}), 1000, createTimeoutError));

    await vi.advanceTimersByTimeAsync(999);
    expect(state.settled).toBe(false);
    expect(createTimeoutError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    expect(state.error).toBe(timeoutError);
    expect(createTimeoutError).toHaveBeenCalledTimes(1);
  });

  it("passes a resolved value through and clears its timer", async () => {
    const createTimeoutError = vi.fn(() => new Error("timed out"));
    await expect(withTimeout(Promise.resolve(7), 1000, createTimeoutError)).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(createTimeoutError).not.toHaveBeenCalled();
  });

  it("passes a rejection through unchanged and clears its timer", async () => {
    const failure = new Error("boom");
    const createTimeoutError = vi.fn(() => new Error("timed out"));
    await expect(withTimeout(Promise.reject(failure), 1000, createTimeoutError)).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(createTimeoutError).not.toHaveBeenCalled();
  });

  it("uses the value of a promise that settles before the deadline", async () => {
    let resolveRequest;
    const request = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const createTimeoutError = vi.fn(() => new Error("timed out"));
    const state = track(withTimeout(request, 1000, createTimeoutError));

    await vi.advanceTimersByTimeAsync(500);
    resolveRequest("reply");
    await vi.advanceTimersByTimeAsync(0);
    expect(state).toMatchObject({ settled: true, value: "reply" });
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(createTimeoutError).not.toHaveBeenCalled();
  });

  it("clears its timer after timing out", async () => {
    const state = track(withTimeout(new Promise(() => {}), AI_TIMEOUT_MS, () => new Error("timed out")));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
    expect(state.settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
