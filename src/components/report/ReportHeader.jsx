import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy, Printer } from "lucide-react";

import { buildReportSummaryText } from "../../lib/reportText.js";

// How long "Summary copied" stays on screen.
const COPIED_MESSAGE_MS = 4000;

const COPY_FAILED_MESSAGE =
  "Couldn't copy the summary. Select the report text and copy it manually.";

// Put before the copied summary of the sample report, so pasted text can't
// pass for a real analysis.
const SAMPLE_SUMMARY_PREFIX = "Sample report (fictional resume)";

/**
 * "Copy summary" and "Print or save as PDF", with the copy result shown under
 * them. The result line is a polite live region that is always in the page
 * (empty when idle), so each change is announced once.
 */
function ReportActions({ report, isSample }) {
  // "idle", "copied" or "failed"
  const [copyStatus, setCopyStatus] = useState("idle");
  const clearCopiedTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(clearCopiedTimerRef.current), []);

  const handleCopySummary = async () => {
    clearTimeout(clearCopiedTimerRef.current);
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("navigator.clipboard.writeText is not available");
      }
      const summaryText = buildReportSummaryText(report);
      await navigator.clipboard.writeText(
        isSample ? `${SAMPLE_SUMMARY_PREFIX}\n\n${summaryText}` : summaryText,
      );
      setCopyStatus("copied");
      clearCopiedTimerRef.current = setTimeout(
        () => setCopyStatus("idle"),
        COPIED_MESSAGE_MS,
      );
    } catch (err) {
      console.error("[resume-analyzer] copying the summary failed:", err);
      setCopyStatus("failed");
    }
  };

  // Opens the browser's print dialog, where the report can be printed or
  // saved as a PDF. The print stylesheet in index.css lays the report out
  // for paper.
  const handlePrint = () => window.print();

  return (
    <>
      <div className="report-actions">
        <button
          type="button"
          className="report-action-btn"
          onClick={handleCopySummary}
        >
          <Copy size={16} strokeWidth={2.5} aria-hidden="true" /> Copy summary
        </button>
        <button type="button" className="report-action-btn" onClick={handlePrint}>
          <Printer size={16} strokeWidth={2.5} aria-hidden="true" />
          Print or save as PDF
        </button>
      </div>
      <p
        className={`report-action-feedback${copyStatus === "failed" ? " report-action-feedback--error" : ""}`}
        aria-live="polite"
      >
        {copyStatus === "copied" && (
          <>
            <Check size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>Summary copied</span>
          </>
        )}
        {copyStatus === "failed" && (
          <>
            <AlertTriangle size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>{COPY_FAILED_MESSAGE}</span>
          </>
        )}
      </p>
    </>
  );
}

/**
 * The report's header: the way back, the title (which DashboardView focuses
 * through titleRef when the report opens) and the report actions. The DOM
 * order is back, title, Copy, Print, which is also the Tab order; the
 * stylesheet puts the actions on the back button's row on wide screens.
 */
function ReportHeader({ report, isSample, onBack, titleRef }) {
  return (
    <div className="dashboard-header">
      <button type="button" className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} strokeWidth={2.5} aria-hidden="true" />
        {isSample ? "Back to home" : "Analyze another resume"}
      </button>
      {/* Printed above the title instead of the buttons. */}
      <p className="print-only report-print-brand">AI Resume Analyzer</p>
      <h1 ref={titleRef} className="dashboard-title" tabIndex={-1}>
        {isSample ? "Sample analysis report" : "Analysis report"}
      </h1>
      <ReportActions report={report} isSample={isSample} />
    </div>
  );
}

export default ReportHeader;
