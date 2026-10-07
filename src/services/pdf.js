import { AnalysisError } from "../lib/errors.js";
import { MAX_PAGES, PDF_TIMEOUT_MS, withTimeout } from "../lib/limits.js";

// pdf.js is most of the app's JavaScript, so it is fetched on first use (or
// earlier, through preloadPdfReader) rather than with the page. Every caller
// shares this one promise, so it loads once.
let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      // The worker is copied into the build as-is, without Vite minifying
      // it, so the package's own minified copy is the one to ship.
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(
      ([pdfjsLib, { default: workerUrl }]) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        return pdfjsLib;
      },
      (err) => {
        // Forget the failed attempt so the next call tries again. Chrome keeps
        // a failed module import cached until the page reloads, so there the
        // retry fails at once; that is why PDF_LIB_LOAD asks for a reload.
        pdfjsPromise = null;
        throw err;
      },
    );
  }
  return pdfjsPromise;
}

/**
 * Starts loading pdf.js in the background when the user looks about to pick
 * a file. A failure here is only logged: the next file the user picks tries
 * the load again (in Chrome that needs a page reload to succeed), and that
 * attempt reports its own error.
 */
export function preloadPdfReader() {
  loadPdfjs().catch((err) => {
    console.warn("[resume-analyzer] preloading the PDF reader failed:", err);
  });
}

// When the worker script fails to load, pdf.js falls back to running the
// worker code on the page, which needs the same file, and rejects with
// "Setting up fake worker failed: …" (pdf.js 6.4, PDFWorker). The file the
// user chose was never read, so this is reported as the PDF reader not
// loading. pdf.js keeps that failed fallback for the page's lifetime, so a
// retry needs a reload, as PDF_LIB_LOAD's message says.
const WORKER_SETUP_FAILURE_PREFIX = "Setting up fake worker failed";

function isWorkerSetupFailure(err) {
  return (
    typeof err?.message === "string" &&
    err.message.startsWith(WORKER_SETUP_FAILURE_PREFIX)
  );
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
export async function extractPdfText(file) {
  let pdfjsLib;
  try {
    // Bounded like parsing below: a stalled download must not leave the
    // loading state up forever.
    pdfjsLib = await withTimeout(
      loadPdfjs(),
      PDF_TIMEOUT_MS,
      () => new Error(`pdf.js did not load within ${PDF_TIMEOUT_MS} ms`),
    );
  } catch (err) {
    throw new AnalysisError("PDF_LIB_LOAD", { cause: err });
  }

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
    if (isWorkerSetupFailure(err)) {
      throw new AnalysisError("PDF_LIB_LOAD", { cause: err });
    }
    // InvalidPDFException and anything else pdf.js rejects with.
    throw new AnalysisError("PDF_PARSE", { cause: err });
  } finally {
    // Releases the pdf.js worker for this document on every path. After a
    // timeout this also stops the parsing that is still running.
    loadingTask?.destroy().catch((destroyError) => {
      console.error("[resume-analyzer] failed to release PDF resources:", destroyError);
    });
  }
}
