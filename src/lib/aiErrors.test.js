import { describe, expect, it } from "vitest";

import { describeAiFailure, isFailedAiResponse } from "./aiErrors.js";

const RESULT_KEYS = ["code", "errorCode", "message", "status", "usageLimited"];
const ERROR_CODES = new Set([
  "AI_USAGE_LIMIT",
  "AI_SIGN_IN_CLOSED",
  "AI_POPUP_BLOCKED",
  "AI_AUTH",
  "AI_FAILED",
]);

/** A plain XMLHttpRequest look-alike, as Puter can reject with. */
const xhrLike = (status, statusText, responseText) => ({
  readyState: 4,
  status,
  statusText,
  responseText,
  response: responseText,
  secret: "SECRET-HEADERS",
  getAllResponseHeaders() {
    return "";
  },
});

/**
 * Behaves like a real XMLHttpRequest: reading responseText throws when
 * responseType isn't "" or "text".
 */
class FakeXhr {
  constructor(status, body, { statusText = "", responseType = "", response } = {}) {
    this.readyState = 4;
    this.status = status;
    this.statusText = statusText;
    this.responseType = responseType;
    this.body = body;
    this.explicitResponse = response;
    this.secret = "SECRET-HEADERS";
  }

  get responseText() {
    if (this.responseType !== "" && this.responseType !== "text") {
      throw new DOMException("responseText is not available", "InvalidStateError");
    }
    return this.body;
  }

  get response() {
    if (this.explicitResponse !== undefined) return this.explicitResponse;
    return this.responseType === "json" ? JSON.parse(this.body) : this.body;
  }
}

function revokedProxy() {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
}

function proxyThrowingOnEveryTrap() {
  const fail = () => {
    throw new Error("trap");
  };
  return new Proxy({}, { get: fail, getPrototypeOf: fail, has: fail, ownKeys: fail });
}

function objectWithThrowingGetters() {
  const keys = ["code", "status", "message", "error", "response", "responseText", "statusText", "usage_limited"];
  return Object.defineProperties(
    {},
    Object.fromEntries(
      keys.map((key) => [
        key,
        {
          enumerable: true,
          get() {
            throw new Error(key);
          },
        },
      ]),
    ),
  );
}

function circularWithCode() {
  const value = { code: "popup_blocked" };
  value.self = value;
  return value;
}

const OVERSIZED_PADDING = "x".repeat(30000);

// lib/aiErrors.js parses a response body only up to this many characters.
const MAX_PARSED_BODY_LENGTH = 20000;

/** A JSON body carrying an insufficient_funds code, exactly `length` characters long. */
function usageLimitBodyOfLength(length) {
  const unpaddedLength = JSON.stringify({ error: { code: "insufficient_funds" }, pad: "" }).length;
  return JSON.stringify({ error: { code: "insufficient_funds" }, pad: "x".repeat(length - unpaddedLength) });
}

// [label, () => rejection, expected fields]. Factories keep exotic values
// (throwing proxies, getters) out of the test-name formatter.
const REJECTION_CASES = [
  // Errors and DOMExceptions
  ["Error", () => new Error("Network down"), { errorCode: "AI_FAILED", code: null, status: null, message: "Network down" }],
  ["Error with code auth_window_closed", () => Object.assign(new Error("closed"), { code: "auth_window_closed" }), { errorCode: "AI_SIGN_IN_CLOSED", code: "auth_window_closed" }],
  ["Error with code insufficient_funds", () => Object.assign(new Error("Insufficient funds"), { code: "insufficient_funds" }), { errorCode: "AI_USAGE_LIMIT", code: "insufficient_funds" }],
  ["DOMException (its numeric code is not a code)", () => new DOMException("aborted", "AbortError"), { errorCode: "AI_FAILED", code: null, message: "aborted" }],

  // Plain objects: code
  ["{ success: false, error: { code: insufficient_funds, message } }", () => ({ success: false, error: { code: "insufficient_funds", message: "Insufficient funds" } }), { errorCode: "AI_USAGE_LIMIT", code: "insufficient_funds", message: "Insufficient funds" }],
  ["{ error: { code: subscription_required } }", () => ({ error: { code: "subscription_required" } }), { errorCode: "AI_USAGE_LIMIT", code: "subscription_required" }],
  ["{ code: INSUFFICIENT_FUNDS } (any case)", () => ({ code: "INSUFFICIENT_FUNDS" }), { errorCode: "AI_USAGE_LIMIT" }],
  ["{ code: usage_limited }", () => ({ code: "usage_limited" }), { errorCode: "AI_USAGE_LIMIT", code: "usage_limited" }],
  ["{ error: { code: USAGE_LIMITED } }", () => ({ error: { code: "USAGE_LIMITED" } }), { errorCode: "AI_USAGE_LIMIT" }],
  ["{ code: ' popup_blocked ' } (padded)", () => ({ code: " popup_blocked " }), { errorCode: "AI_POPUP_BLOCKED", code: "popup_blocked" }],
  ["{ code: auth_window_closed }", () => ({ code: "auth_window_closed" }), { errorCode: "AI_SIGN_IN_CLOSED" }],
  ["{ code: POPUP_BLOCKED } (any case)", () => ({ code: "POPUP_BLOCKED" }), { errorCode: "AI_POPUP_BLOCKED", code: "POPUP_BLOCKED" }],
  ["{ error: { code: popup_blocked, message } }", () => ({ error: { code: "popup_blocked", message: "Popup blocked" } }), { errorCode: "AI_POPUP_BLOCKED", code: "popup_blocked", message: "Popup blocked" }],
  ["{ code: 123 } (number is not a code)", () => ({ code: 123 }), { errorCode: "AI_FAILED", code: null }],

  // Plain objects: status
  ["{ status: 401, message }", () => ({ status: 401, message: "Unauthorized" }), { errorCode: "AI_AUTH", code: null, status: 401, message: "Unauthorized", usageLimited: false }],
  ["{ status: '401' } (string)", () => ({ status: "401" }), { errorCode: "AI_AUTH", status: 401 }],
  ["{ status: 402, message }", () => ({ status: 402, message: "Payment Required" }), { errorCode: "AI_USAGE_LIMIT", status: 402 }],
  ["{ status: '402 ' } (padded string)", () => ({ status: "402 " }), { errorCode: "AI_USAGE_LIMIT", status: 402 }],
  ["{ status: 402.5 } (not an integer)", () => ({ status: 402.5 }), { errorCode: "AI_FAILED", status: null }],
  ["{ error: { status: 401, message } } (nested status)", () => ({ error: { status: 401, message: "Unauthorized" } }), { errorCode: "AI_AUTH", status: 401, message: "Unauthorized" }],

  // usage_limited flag
  ["{ usage_limited: true, message }", () => ({ usage_limited: true, message: "Usage limited" }), { errorCode: "AI_USAGE_LIMIT", usageLimited: true }],
  ["{ error: { usage_limited: true } }", () => ({ error: { usage_limited: true } }), { errorCode: "AI_USAGE_LIMIT", usageLimited: true }],
  ["{ usage_limited: 'true' } (string is not the flag)", () => ({ usage_limited: "true" }), { errorCode: "AI_FAILED", usageLimited: false }],

  // Precedence
  ["usage-limit code wins over 401", () => ({ status: 401, code: "insufficient_funds" }), { errorCode: "AI_USAGE_LIMIT" }],
  ["popup code wins over 401", () => ({ status: 401, error: { code: "popup_blocked" } }), { errorCode: "AI_POPUP_BLOCKED" }],
  ["402 wins over auth_window_closed", () => ({ code: "auth_window_closed", status: 402 }), { errorCode: "AI_USAGE_LIMIT" }],
  ["code wins over a string error", () => ({ code: "popup_blocked", error: "insufficient_funds" }), { errorCode: "AI_POPUP_BLOCKED", code: "popup_blocked" }],

  // A string `error` is a code only when identifier-shaped
  ["{ error: 'insufficient_funds' }", () => ({ error: "insufficient_funds" }), { errorCode: "AI_USAGE_LIMIT", code: "insufficient_funds" }],
  ["{ error: ' INSUFFICIENT_FUNDS ' }", () => ({ error: " INSUFFICIENT_FUNDS " }), { errorCode: "AI_USAGE_LIMIT" }],
  ["{ error: 'usage_limited' }", () => ({ error: "usage_limited" }), { errorCode: "AI_USAGE_LIMIT", code: "usage_limited" }],
  ["{ error: 'popup_blocked' }", () => ({ error: "popup_blocked" }), { errorCode: "AI_POPUP_BLOCKED" }],
  ["{ error: 'auth_window_closed' }", () => ({ error: "auth_window_closed" }), { errorCode: "AI_SIGN_IN_CLOSED", code: "auth_window_closed" }],
  ["{ error: 'Auth_Window_Closed' } (any case)", () => ({ error: "Auth_Window_Closed" }), { errorCode: "AI_SIGN_IN_CLOSED", code: "Auth_Window_Closed" }],
  ["{ error: 'Rate limit exceeded' } (prose is a message)", () => ({ error: "Rate limit exceeded" }), { errorCode: "AI_FAILED", code: null, message: "Rate limit exceeded" }],
  ["{ error: 'insufficient funds' } (space)", () => ({ error: "insufficient funds" }), { errorCode: "AI_FAILED", code: null }],
  ["{ error: 'insufficient-funds' } (hyphen)", () => ({ error: "insufficient-funds" }), { errorCode: "AI_FAILED", code: null }],
  ["{ error: 'Error' } (unknown identifier)", () => ({ error: "Error" }), { errorCode: "AI_FAILED", code: "Error" }],
  ["{ error: 1000-character identifier }", () => ({ error: "a".repeat(1000) }), { errorCode: "AI_FAILED" }],

  // XMLHttpRequest-like rejections
  ["XHR-like 402 + JSON body", () => xhrLike(402, "Payment Required", JSON.stringify({ success: false, error: { code: "insufficient_funds", message: "Out of credits" } })), { errorCode: "AI_USAGE_LIMIT", code: "insufficient_funds", status: 402, message: "Out of credits" }],
  ["XHR-like 401 + HTML body", () => xhrLike(401, "Unauthorized", "<html>nope</html>"), { errorCode: "AI_AUTH", status: 401, message: "Unauthorized" }],
  ["XHR-like 500 + JSON { code, message }", () => xhrLike(500, "Internal Server Error", '{"code":"popup_blocked","message":"x"}'), { errorCode: "AI_POPUP_BLOCKED", status: 500 }],
  ["XHR-like status 0 (no response)", () => xhrLike(0, "", ""), { errorCode: "AI_FAILED", status: null, message: null }],
  ["XHR-like status 0 with a body status of 402", () => xhrLike(0, "", '{"status":402}'), { errorCode: "AI_USAGE_LIMIT", status: 402 }],
  ["XHR-like 500 + body { error: 'subscription_required' }", () => xhrLike(500, "x", '{"error":"subscription_required"}'), { errorCode: "AI_USAGE_LIMIT", code: "subscription_required" }],
  ["XHR-like 400 + body { error: 'insufficient_funds' }", () => ({ status: 400, responseText: '{"error":"insufficient_funds"}' }), { errorCode: "AI_USAGE_LIMIT" }],
  ["XHR-like body of exactly 20,000 chars is parsed", () => xhrLike(500, "Server Error", usageLimitBodyOfLength(MAX_PARSED_BODY_LENGTH)), { errorCode: "AI_USAGE_LIMIT", code: "insufficient_funds" }],
  ["XHR-like body of 20,001 chars is not parsed", () => xhrLike(500, "Server Error", usageLimitBodyOfLength(MAX_PARSED_BODY_LENGTH + 1)), { errorCode: "AI_FAILED", code: null, message: "Server Error" }],
  ["XHR-like body over 20,000 chars is not parsed", () => xhrLike(500, "Server Error", JSON.stringify({ error: { code: "insufficient_funds" }, pad: OVERSIZED_PADDING })), { errorCode: "AI_FAILED", code: null, message: "Server Error" }],
  ["XHR 402 text body", () => new FakeXhr(402, '{"error":{"code":"insufficient_funds","message":"no funds"}}'), { errorCode: "AI_USAGE_LIMIT", message: "no funds" }],
  ["XHR 200 with a { success: false } body", () => new FakeXhr(200, '{"success":false,"error":{"code":"insufficient_funds"}}'), { errorCode: "AI_USAGE_LIMIT", status: 200 }],
  ["XHR 401 HTML body", () => new FakeXhr(401, "<html>Unauthorized</html>", { statusText: "Unauthorized" }), { errorCode: "AI_AUTH", message: "Unauthorized" }],
  ["XHR blob (responseText throws)", () => new FakeXhr(401, "{}", { statusText: "Unauthorized", responseType: "blob" }), { errorCode: "AI_AUTH", status: 401, message: "Unauthorized" }],
  ["XHR json with usage_limited body", () => new FakeXhr(429, '{"usage_limited":true}', { statusText: "Too Many Requests", responseType: "json" }), { errorCode: "AI_USAGE_LIMIT", status: 429, usageLimited: true }],
  ["XHR json with an error object response", () => new FakeXhr(500, null, { responseType: "json", response: { error: { code: "subscription_required" } } }), { errorCode: "AI_USAGE_LIMIT", code: "subscription_required" }],
  ["XHR blob with an empty response", () => new FakeXhr(500, null, { responseType: "blob", response: {} }), { errorCode: "AI_FAILED", status: 500 }],
  ["XHR oversized text body", () => new FakeXhr(500, `{"error":{"code":"insufficient_funds"},"pad":"${"x".repeat(20001)}"}`), { errorCode: "AI_FAILED", code: null }],

  // Primitives and nothing at all
  ["a string", () => "Something broke", { errorCode: "AI_FAILED", code: null, status: null, message: "Something broke" }],
  ["a bare 'insufficient_funds' string (a message, not a code)", () => "insufficient_funds", { errorCode: "AI_FAILED", code: null, message: "insufficient_funds" }],
  ["a blank string", () => "   ", { errorCode: "AI_FAILED", message: null }],
  ["an empty string", () => "", { errorCode: "AI_FAILED", message: null }],
  ["null", () => null, { errorCode: "AI_FAILED", code: null, status: null, message: null, usageLimited: false }],
  ["undefined", () => undefined, { errorCode: "AI_FAILED", code: null, status: null, message: null, usageLimited: false }],
  ["the number 402 (not a status)", () => 402, { errorCode: "AI_FAILED", status: null, message: "402" }],
  ["a BigInt", () => 10n, { errorCode: "AI_FAILED", message: "10" }],
  ["a Symbol", () => Symbol("s"), { errorCode: "AI_FAILED", message: "Symbol(s)" }],
  ["false", () => false, { errorCode: "AI_FAILED", message: "false" }],

  // Exotic objects
  ["a function with a code", () => Object.assign(() => {}, { code: "popup_blocked" }), { errorCode: "AI_POPUP_BLOCKED" }],
  ["an array", () => ["insufficient_funds"], { errorCode: "AI_FAILED", code: null }],
  ["a Promise", () => Promise.resolve(1), { errorCode: "AI_FAILED" }],
  ["a revoked Proxy", revokedProxy, { errorCode: "AI_FAILED", code: null, status: null, message: null }],
  ["a Proxy that throws on every trap", proxyThrowingOnEveryTrap, { errorCode: "AI_FAILED", code: null, status: null, message: null }],
  ["an object whose getters throw", objectWithThrowingGetters, { errorCode: "AI_FAILED", code: null, status: null, message: null }],
  ["a circular object", circularWithCode, { errorCode: "AI_POPUP_BLOCKED" }],
  ["a null-prototype object", () => Object.assign(Object.create(null), { code: "auth_window_closed" }), { errorCode: "AI_SIGN_IN_CLOSED" }],
  ["fields whose toString throws", () => ({ message: { toString() { throw new Error("ts"); } }, code: { toString() { throw new Error("ts"); } } }), { errorCode: "AI_FAILED", code: null, message: null }],
];

describe("describeAiFailure", () => {
  it("builds the boundary bodies at exactly 20,000 and 20,001 characters", () => {
    expect(usageLimitBodyOfLength(MAX_PARSED_BODY_LENGTH)).toHaveLength(20000);
    expect(usageLimitBodyOfLength(MAX_PARSED_BODY_LENGTH + 1)).toHaveLength(20001);
  });

  it.each(REJECTION_CASES)("%s", (_label, makeRejection, expected) => {
    const result = describeAiFailure(makeRejection());

    expect(result).toMatchObject(expected);
    // Only the extracted fields, all primitives, so the result is safe to log
    // and never holds on to a whole XMLHttpRequest.
    expect(Object.keys(result).sort()).toEqual(RESULT_KEYS);
    for (const value of Object.values(result)) {
      expect(value === null || ["string", "number", "boolean"].includes(typeof value)).toBe(true);
    }
    expect(ERROR_CODES.has(result.errorCode)).toBe(true);
  });

  it("caps long messages at 300 characters plus an ellipsis", () => {
    const { message } = describeAiFailure({ message: "m".repeat(5000) });
    expect(message).toHaveLength(301);
    expect(message.endsWith("\u2026")).toBe(true);
  });

  it("trims messages and leaves short ones whole", () => {
    expect(describeAiFailure({ message: "  Unauthorized  " }).message).toBe("Unauthorized");
    expect(describeAiFailure({ message: "m".repeat(300) }).message).toHaveLength(300);
  });

  it("keeps XMLHttpRequest internals out of the result", () => {
    const serialised = JSON.stringify(
      describeAiFailure(new FakeXhr(402, '{"error":{"code":"insufficient_funds"}}')),
    );
    expect(serialised).not.toContain("SECRET");
    expect(serialised).not.toContain("readyState");
  });
});

describe("isFailedAiResponse", () => {
  it.each([
    ["{ success: false }", () => ({ success: false }), true],
    ["{ success: false, error }", () => ({ success: false, error: { code: "insufficient_funds" } }), true],
    ["{ success: 'false' } (string)", () => ({ success: "false" }), false],
    ["{ success: 0 }", () => ({ success: 0 }), false],
    ["{ success: true }", () => ({ success: true }), false],
    ["a normal reply", () => ({ message: { content: "x" } }), false],
    ["a string", () => "{}", false],
    ["null", () => null, false],
    ["undefined", () => undefined, false],
    ["an array", () => [false], false],
    ["a revoked Proxy", revokedProxy, false],
    ["a Proxy that throws on every trap", proxyThrowingOnEveryTrap, false],
  ])("%s -> %s", (_label, makeResponse, expected) => {
    expect(isFailedAiResponse(makeResponse())).toBe(expected);
  });
});
