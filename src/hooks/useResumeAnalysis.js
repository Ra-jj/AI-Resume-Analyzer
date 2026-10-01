import { useRef, useState } from "react";

import { AnalysisError, toUserError } from "../lib/errors.js";
import { isFileTooLarge, isPdfFile } from "../lib/files.js";
import {
  MAX_JOB_DESCRIPTION_CHARACTERS,
  MIN_TEXT_CHARACTERS,
  collapseWhitespace,
  countNonWhitespaceCharacters,
  prepareJobDescription,
  truncateForAnalysis,
} from "../lib/limits.js";
import { buildReport } from "../lib/report.js";
import { runResumeChecks } from "../lib/resumeChecks.js";
import { isAiServiceAvailable, requestAnalysis } from "../services/analyze.js";
import { extractPdfText, preloadPdfReader } from "../services/pdf.js";

/** Checks that can reject a file instantly, before any loading state. */
function getPreflightErrorCode(file, jobDescription) {
  if (!isPdfFile(file)) return "INVALID_TYPE";
  if (isFileTooLarge(file)) return "TOO_LARGE";
  if (jobDescription.isTooShort) return "JD_TOO_SHORT";
  if (!isAiServiceAvailable()) return "AI_UNAVAILABLE";
  return null;
}

/**
 * State and actions for the upload → extract → analyze flow: which screen is
 * showing, the loading and error state, the optional job description, and
 * the finished report.
 */
export function useResumeAnalysis() {
  const [view, setView] = useState("upload"); // 'upload' or 'dashboard'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { code, message } or null
  const [results, setResults] = useState(null);
  const [wasTextTruncated, setWasTextTruncated] = useState(false);
  // Kept across "Analyze another resume", so several resumes can be compared
  // with the same role.
  const [jobDescription, setJobDescriptionText] = useState("");
  // Changes per report so the dashboard's error boundary always starts fresh.
  const [reportId, setReportId] = useState(0);
  // `loading` only updates on the next render; this ref blocks a second file
  // that arrives before then (e.g. a double drop).
  const isProcessingRef = useRef(false);

  const processFile = async (file) => {
    if (!file || isProcessingRef.current) return;

    const preparedJobDescription = prepareJobDescription(jobDescription);
    const preflightErrorCode = getPreflightErrorCode(file, preparedJobDescription);
    if (preflightErrorCode) {
      setError(toUserError(new AnalysisError(preflightErrorCode)));
      return;
    }

    isProcessingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const pdfText = collapseWhitespace(await extractPdfText(file));
      if (countNonWhitespaceCharacters(pdfText) < MIN_TEXT_CHARACTERS) {
        throw new AnalysisError("NO_TEXT");
      }
      // The checks read the whole resume; only the AI's copy is capped.
      const resumeCheckResult = runResumeChecks(pdfText);
      const { text, truncated } = truncateForAnalysis(pdfText);

      const analysis = await requestAnalysis(text, preparedJobDescription.text);
      setResults(buildReport(analysis, resumeCheckResult));
      setWasTextTruncated(truncated);
      setReportId((previousId) => previousId + 1);
      setView("dashboard");
    } catch (err) {
      console.error(
        `[resume-analyzer] analysis failed (${err?.code ?? "UNEXPECTED"}):`,
        err?.cause ?? err,
      );
      setError(toUserError(err));
    } finally {
      isProcessingRef.current = false;
      setLoading(false);
    }
  };

  const setJobDescription = (text) => {
    setJobDescriptionText(
      typeof text === "string" ? text.slice(0, MAX_JOB_DESCRIPTION_CHARACTERS) : "",
    );
    // A "too short" message is about the text before this edit.
    setError((currentError) =>
      currentError?.code === "JD_TOO_SHORT" ? null : currentError,
    );
  };

  const clearJobDescription = () => setJobDescription("");

  const resetToUpload = () => {
    setView("upload");
    setResults(null);
    setWasTextTruncated(false);
    setError(null);
  };

  return {
    view,
    loading,
    error,
    results,
    wasTextTruncated,
    reportId,
    jobDescription,
    processFile,
    resetToUpload,
    setJobDescription,
    clearJobDescription,
    // Lets the upload screen start fetching pdf.js before a file is chosen.
    preloadPdfReader,
  };
}
