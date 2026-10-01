// Reads a rejected puter.ai.chat call. Puter may reject with an Error, a
// plain object, a raw XMLHttpRequest, a string or nothing at all, so every
// field is read defensively and nothing here assumes `.message` exists.

// Puter error codes that mean the visitor's AI usage allowance is used up.
const USAGE_LIMIT_CODES = new Set([
  "insufficient_funds",
  "subscription_required",
  "usage_limited",
]);
const SIGN_IN_CLOSED_CODE = "auth_window_closed";
const POPUP_BLOCKED_CODE = "popup_blocked";
const PAYMENT_REQUIRED_STATUS = 402;
const UNAUTHORIZED_STATUS = 401;

// Keeps a long server message (or an HTML error page) out of the console log.
const MAX_MESSAGE_LENGTH = 300;
// A response body bigger than this is not parsed for an error code.
const MAX_PARSED_BODY_LENGTH = 20000;

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    // A revoked Proxy throws here; it is not a usable body either way.
    return false;
  }
}

/**
 * Reads value[key] without letting a throwing getter escape. For example,
 * XMLHttpRequest.responseText throws when responseType isn't text.
 */
function readProperty(value, key) {
  if (!isObjectLike(value)) return undefined;
  try {
    return value[key];
  } catch {
    return undefined;
  }
}

function toCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return code ? code : null;
}

/**
 * A string `error` field used as a code ({ error: "insufficient_funds" }).
 * Only identifier-shaped strings count; prose such as "Rate limit exceeded"
 * is a message, not a code.
 */
function toCodeFromErrorString(value) {
  const code = toCode(value);
  return code !== null && /^[a-z][a-z0-9_]*$/i.test(code) ? code : null;
}

function toStatus(value) {
  const status =
    typeof value === "string" && /^\d{3}$/.test(value.trim()) ? Number(value) : value;
  // XMLHttpRequest reports 0 when no HTTP response arrived; that is not a status.
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function toMessage(value) {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (!message) return null;
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…`
    : message;
}

/** String(value) for primitives such as numbers, BigInt and Symbol, or null. */
function primitiveToString(value) {
  try {
    return String(value);
  } catch {
    return null;
  }
}

/** The JSON body of an XMLHttpRequest-like rejection, when it has one. */
function readResponseBody(rejection) {
  const response = readProperty(rejection, "response");
  if (isPlainObject(response)) return response;

  const text = readProperty(rejection, "responseText");
  if (typeof text !== "string" || !text.trim() || text.length > MAX_PARSED_BODY_LENGTH) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return isObjectLike(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Pulls { code, status, message, usageLimited } out of any rejection value. */
function extractAiFailureDetails(rejection) {
  if (rejection === null || rejection === undefined) {
    return { code: null, status: null, message: null, usageLimited: false };
  }
  if (!isObjectLike(rejection)) {
    return {
      code: null,
      status: null,
      message: toMessage(primitiveToString(rejection)),
      usageLimited: false,
    };
  }

  // Known shapes: the rejection itself ({ code }, { status, message }, an
  // Error), a nested { error: { code, message } }, and the JSON body of an
  // XMLHttpRequest, which can itself nest an `error` object.
  const nestedError = readProperty(rejection, "error");
  const body = readResponseBody(rejection);
  const bodyError = readProperty(body, "error");
  const sources = [rejection, nestedError, body, bodyError].filter(isObjectLike);

  const findFirst = (key, convert) => {
    for (const source of sources) {
      const value = convert(readProperty(source, key));
      if (value !== null) return value;
    }
    return null;
  };

  return {
    code:
      findFirst("code", toCode) ??
      toCodeFromErrorString(nestedError) ??
      toCodeFromErrorString(bodyError),
    status: findFirst("status", toStatus),
    message:
      findFirst("message", toMessage) ??
      toMessage(nestedError) ??
      toMessage(bodyError) ??
      toMessage(readProperty(rejection, "statusText")),
    usageLimited: sources.some(
      (source) => readProperty(source, "usage_limited") === true,
    ),
  };
}

function getAiErrorCode({ code, status, usageLimited }) {
  const normalizedCode = code?.toLowerCase() ?? null;
  if (
    USAGE_LIMIT_CODES.has(normalizedCode) ||
    status === PAYMENT_REQUIRED_STATUS ||
    usageLimited
  ) {
    return "AI_USAGE_LIMIT";
  }
  if (normalizedCode === SIGN_IN_CLOSED_CODE) return "AI_SIGN_IN_CLOSED";
  if (normalizedCode === POPUP_BLOCKED_CODE) return "AI_POPUP_BLOCKED";
  if (status === UNAUTHORIZED_STATUS) return "AI_AUTH";
  return "AI_FAILED";
}

/**
 * True when puter.ai.chat resolved with Puter's failure shape
 * ({ success: false, error }) instead of a reply.
 */
export function isFailedAiResponse(response) {
  return isObjectLike(response) && readProperty(response, "success") === false;
}

/**
 * Describes a rejected AI request without throwing, whatever the rejection
 * value is. `errorCode` is the AnalysisError code to show the user; `code`,
 * `status` and `message` are what Puter reported (null when absent) and are
 * safe to log, unlike the raw rejection, which can be a whole XMLHttpRequest.
 */
export function describeAiFailure(rejection) {
  const details = extractAiFailureDetails(rejection);
  return { errorCode: getAiErrorCode(details), ...details };
}
