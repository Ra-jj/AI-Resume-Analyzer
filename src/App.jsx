/* global puter */
import { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import UploadView from "./components/UploadView";
import DashboardView from "./components/DashboardView";
import ErrorBoundary, { ErrorFallback } from "./components/ErrorBoundary";
import {
  extractJson,
  getResponseText,
  normalizeAnalysis,
} from "./lib/analysis.js";
import { AnalysisError, toUserError } from "./lib/errors.js";
import { isFileTooLarge, isPdfFile } from "./lib/files.js";
import {
  AI_TIMEOUT_MS,
  MAX_PAGES,
  MIN_TEXT_CHARACTERS,
  PDF_TIMEOUT_MS,
  collapseWhitespace,
  countNonWhitespaceCharacters,
  truncateForAnalysis,
  withTimeout,
} from "./lib/limits.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

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

function isAiServiceAvailable() {
  return typeof puter !== "undefined" && typeof puter?.ai?.chat === "function";
}

async function readPdfPages(loadingTask) {
  const pdf = await loadingTask.promise;

  if (pdf.numPages > MAX_PAGES) {
    throw new AnalysisError("TOO_MANY_PAGES", {
      details: { pageCount: pdf.numPages },
    });
  }

  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pageTexts.push(
      textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  return pageTexts.join("\n\n");
}

/** Reads every page's text with pdf.js. Throws AnalysisError on failure. */
async function extractPdfText(file) {
  let data;
  try {
    data = await file.arrayBuffer();
  } catch (err) {
    throw new AnalysisError("FILE_READ", { cause: err });
  }

  let loadingTask;
  try {
    loadingTask = pdfjsLib.getDocument({ data });
    return await withTimeout(
      readPdfPages(loadingTask),
      PDF_TIMEOUT_MS,
      () => new AnalysisError("PDF_TIMEOUT"),
    );
  } catch (err) {
    if (err instanceof AnalysisError) throw err;
    if (err?.name === "PasswordException") {
      throw new AnalysisError("PASSWORD", { cause: err });
    }
    throw new AnalysisError("PDF_PARSE", { cause: err });
  } finally {
    // Releases the pdf.js worker for this document on every path. After a
    // timeout this also stops the parsing that is still running.
    loadingTask?.destroy().catch((destroyError) => {
      console.error("[resume-analyzer] failed to release PDF resources:", destroyError);
    });
  }
}

/** Sends the resume text to the AI and returns a normalized report. */
async function requestAnalysis(resumeText) {
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

/** Checks that can reject a file instantly, before any loading state. */
function getPreflightErrorCode(file) {
  if (!isPdfFile(file)) return "INVALID_TYPE";
  if (isFileTooLarge(file)) return "TOO_LARGE";
  if (!isAiServiceAvailable()) return "AI_UNAVAILABLE";
  return null;
}

function App() {
  const [view, setView] = useState("upload"); // 'upload' or 'dashboard'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { code, message } or null
  const [results, setResults] = useState(null);
  const [wasTextTruncated, setWasTextTruncated] = useState(false);
  // Changes per report so the dashboard's error boundary always starts fresh.
  const [reportId, setReportId] = useState(0);
  // `loading` only updates on the next render; this ref blocks a second file
  // that arrives before then (e.g. a double drop).
  const isProcessingRef = useRef(false);

  const processFile = async (file) => {
    if (!file || isProcessingRef.current) return;

    const preflightErrorCode = getPreflightErrorCode(file);
    if (preflightErrorCode) {
      if (preflightErrorCode === "AI_UNAVAILABLE") {
        console.error(
          "[resume-analyzer] puter.ai.chat is not available; typeof puter =",
          typeof puter,
        );
      }
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
      const { text, truncated } = truncateForAnalysis(pdfText);

      const report = await requestAnalysis(text);
      setResults(report);
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

  const resetToUpload = () => {
    setView("upload");
    setResults(null);
    setWasTextTruncated(false);
    setError(null);
  };

  if (view === "dashboard" && results) {
    return (
      <ErrorBoundary
        key={reportId}
        name="dashboard"
        fallback={
          <ErrorFallback
            title="The report couldn't be displayed"
            message="The analysis finished, but its report failed to render. Upload a resume to try again."
            actionLabel="Analyze another resume"
            onAction={resetToUpload}
          />
        }
      >
        <DashboardView
          results={results}
          wasTextTruncated={wasTextTruncated}
          onBack={resetToUpload}
        />
      </ErrorBoundary>
    );
  }

  return (
    <UploadView loading={loading} error={error} onFileSelected={processFile} />
  );
}

export default App;
