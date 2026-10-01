// Explicit ".js" so these pure modules can also be imported directly by Node.
import { AI_TIMEOUT_MS, MAX_FILE_SIZE_MB, MAX_PAGES } from "./limits.js";

// Each message says what happened and what the user can do next. They must
// not claim a cause that the code hasn't actually observed.
const ERROR_MESSAGES = {
  INVALID_TYPE: "Only PDF files can be analyzed. Choose a .pdf file and try again.",
  TOO_LARGE: `This file is over the ${MAX_FILE_SIZE_MB} MB limit. Choose a PDF of ${MAX_FILE_SIZE_MB} MB or less and try again.`,
  TOO_MANY_PAGES: `This PDF has more than ${MAX_PAGES} pages. Upload a shorter version of your resume and try again.`,
  FILE_READ: "The browser couldn't open this file. Select it again and try once more.",
  PASSWORD:
    "This PDF is password-protected. Save a copy without a password and upload that instead.",
  PDF_PARSE:
    "This file couldn't be read as a PDF. Try re-exporting it and uploading again.",
  NO_TEXT:
    "Too little selectable text was found in this PDF to analyze. If it's a scanned image, export it as a text-based PDF and try again.",
  PDF_TIMEOUT:
    "Reading this PDF took too long. Try re-exporting it as a standard PDF and uploading again.",
  PDF_LIB_LOAD:
    "The PDF reader didn't load. Check your connection, then reload the page and try again.",
  AI_UNAVAILABLE:
    "The AI service didn't load. Check that js.puter.com isn't blocked by an extension or network, then reload the page.",
  AI_TIMEOUT: `The AI didn't respond within ${Math.round(AI_TIMEOUT_MS / 60000)} minutes. If a Puter sign-in window opened, finish signing in, then try again.`,
  AI_FAILED:
    "The AI request didn't complete. If a Puter sign-in window opened, finish signing in and try again.",
  AI_BAD_RESPONSE:
    "The AI returned a response we couldn't read. Please try again.",
  UNEXPECTED:
    "Something went wrong while analyzing this resume. Reload the page and try again.",
};

function getErrorMessage(code, details) {
  if (code === "TOO_MANY_PAGES" && Number.isInteger(details?.pageCount)) {
    return `This PDF has ${details.pageCount} pages and the limit is ${MAX_PAGES}. Upload a shorter version of your resume and try again.`;
  }
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNEXPECTED;
}

/**
 * An expected failure in the upload → extract → analyze flow. `code` is the
 * machine-readable reason; `message` is safe to show the user as-is.
 */
export class AnalysisError extends Error {
  constructor(code, { cause, details } = {}) {
    super(getErrorMessage(code, details), cause === undefined ? undefined : { cause });
    this.name = "AnalysisError";
    this.code = code;
    this.details = details;
  }
}

/** Converts any thrown value into the `{ code, message }` shape the UI renders. */
export function toUserError(error) {
  if (error instanceof AnalysisError) {
    return { code: error.code, message: error.message };
  }
  return { code: "UNEXPECTED", message: ERROR_MESSAGES.UNEXPECTED };
}
