import { describe, expect, it } from "vitest";

import { describeAiFailure } from "./aiErrors.js";
import { AnalysisError, toUserError } from "./errors.js";

// Every code the app creates an AnalysisError with, including the ones
// describeAiFailure maps Puter failures to.
const ERROR_CODES = [
  "INVALID_TYPE",
  "TOO_LARGE",
  "TOO_MANY_PAGES",
  "FILE_READ",
  "PASSWORD",
  "PDF_PARSE",
  "NO_TEXT",
  "PDF_TIMEOUT",
  "PDF_LIB_LOAD",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_FAILED",
  "AI_USAGE_LIMIT",
  "AI_SIGN_IN_CLOSED",
  "AI_POPUP_BLOCKED",
  "AI_AUTH",
  "AI_BAD_RESPONSE",
  "JD_TOO_SHORT",
  "UNEXPECTED",
];

const UNEXPECTED_MESSAGE =
  "Something went wrong while analyzing this resume. Reload the page and try again.";

describe("error messages", () => {
  it.each(ERROR_CODES)("%s has its own message", (code) => {
    const { message } = new AnalysisError(code);
    expect(message.trim().length).toBeGreaterThan(0);
    if (code !== "UNEXPECTED") expect(message).not.toBe(UNEXPECTED_MESSAGE);
  });

  it("gives every code a different message", () => {
    const messages = new Set(ERROR_CODES.map((code) => new AnalysisError(code).message));
    expect(messages.size).toBe(ERROR_CODES.length);
  });

  it.each(ERROR_CODES)("%s claims no cause it hasn't observed", (code) => {
    expect(new AnalysisError(code).message).not.toMatch(/because|this means|so it needs/i);
  });

  it("has the wording for the AI failure codes", () => {
    expect(new AnalysisError("AI_USAGE_LIMIT").message).toBe(
      "Your Puter AI usage limit has been reached. Puter may offer an upgrade; otherwise try again later.",
    );
    expect(new AnalysisError("AI_SIGN_IN_CLOSED").message).toBe(
      "The Puter sign-in window was closed before sign-in finished. Choose your file again and complete the sign-in.",
    );
    expect(new AnalysisError("AI_POPUP_BLOCKED").message).toBe(
      "Your browser blocked the Puter sign-in window. Allow pop-ups for this site, then choose your file again.",
    );
    expect(new AnalysisError("AI_AUTH").message).toBe(
      "Puter sign-in didn't complete. Choose your file again and finish signing in.",
    );
    expect(new AnalysisError("JD_TOO_SHORT").message).toBe(
      "The job description is too short to compare against. Paste the full posting or clear the box.",
    );
  });

  it("puts the limits into the messages", () => {
    expect(new AnalysisError("TOO_LARGE").message).toBe(
      "This file is over the 10 MB limit. Choose a PDF of 10 MB or less and try again.",
    );
    expect(new AnalysisError("TOO_MANY_PAGES").message).toBe(
      "This PDF has more than 10 pages. Upload a shorter version of your resume and try again.",
    );
    expect(new AnalysisError("AI_TIMEOUT").message).toBe(
      "The AI didn't respond within 2 minutes. If a Puter sign-in window opened, finish signing in, then try again.",
    );
  });

  it("names the page count when it is known", () => {
    expect(new AnalysisError("TOO_MANY_PAGES", { details: { pageCount: 14 } }).message).toBe(
      "This PDF has 14 pages and the limit is 10. Upload a shorter version of your resume and try again.",
    );
    expect(new AnalysisError("TOO_MANY_PAGES", { details: { pageCount: "14" } }).message).toBe(
      new AnalysisError("TOO_MANY_PAGES").message,
    );
  });

  it("has a message for every code describeAiFailure can return", () => {
    const rejections = [
      { code: "insufficient_funds" },
      { code: "auth_window_closed" },
      { code: "popup_blocked" },
      { status: 401 },
      new Error("x"),
    ];
    for (const rejection of rejections) {
      const { errorCode } = describeAiFailure(rejection);
      expect(ERROR_CODES).toContain(errorCode);
      expect(new AnalysisError(errorCode).message).not.toBe(UNEXPECTED_MESSAGE);
    }
  });
});

describe("AnalysisError", () => {
  it("is an Error with a name, code and details", () => {
    const error = new AnalysisError("TOO_MANY_PAGES", { details: { pageCount: 12 } });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AnalysisError");
    expect(error.code).toBe("TOO_MANY_PAGES");
    expect(error.details).toEqual({ pageCount: 12 });
  });

  it("keeps a cause when one is given, and has none otherwise", () => {
    const cause = { success: false };
    expect(new AnalysisError("AI_FAILED", { cause }).cause).toBe(cause);
    expect("cause" in new AnalysisError("AI_FAILED")).toBe(false);
  });

  it("uses the UNEXPECTED message for an unknown code but keeps the code", () => {
    const error = new AnalysisError("NOPE");
    expect(error.code).toBe("NOPE");
    expect(error.message).toBe(UNEXPECTED_MESSAGE);
  });
});

describe("toUserError", () => {
  it("maps an AnalysisError to its code and message", () => {
    expect(toUserError(new AnalysisError("PDF_PARSE"))).toEqual({
      code: "PDF_PARSE",
      message: "This file couldn't be read as a PDF. Try re-exporting it and uploading again.",
    });
    expect(toUserError(new AnalysisError("NOPE"))).toEqual({ code: "NOPE", message: UNEXPECTED_MESSAGE });
  });

  it("returns exactly { code, message }", () => {
    expect(Object.keys(toUserError(new AnalysisError("NO_TEXT", { cause: new Error("x") })))).toEqual([
      "code",
      "message",
    ]);
  });

  it.each([
    ["a TypeError", new TypeError("x")],
    ["an Error with HTML in it", new Error("boom <b>")],
    ["an object that looks like an AnalysisError", { code: "PDF_PARSE", message: "fake" }],
    ["a string", "x"],
    ["null", null],
    ["undefined", undefined],
  ])("maps %s to UNEXPECTED without exposing its text", (_label, thrown) => {
    expect(toUserError(thrown)).toEqual({ code: "UNEXPECTED", message: UNEXPECTED_MESSAGE });
  });
});
