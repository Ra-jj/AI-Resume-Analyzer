import { useEffect, useRef } from "react";
import { Info } from "lucide-react";

import { MAX_ANALYZED_CHARACTERS } from "../lib/limits.js";
import ReportHeader from "./report/ReportHeader.jsx";
import ReportSheet from "./report/ReportSheet.jsx";
import VerdictBlock from "./report/VerdictBlock.jsx";

// isSample shows the built-in sample report: it is labelled as a sample,
// "Back to home" replaces "Analyze another resume", and it ends with a
// button (onStartOwn) for analyzing the visitor's own resume.
function DashboardView({
  results,
  wasTextTruncated,
  onBack,
  isSample = false,
  onStartOwn,
}) {
  const titleRef = useRef(null);

  useEffect(() => {
    // A new report is a new screen: start at its top, with focus on its
    // heading so screen readers announce it and Tab continues from there.
    // This screen only appears after the user chose a file, so it never
    // takes focus on page load.
    window.scrollTo(0, 0);
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  if (!results) return null;

  return (
    <main className="dashboard-container">
      {/* Plain text, not a live region: the upload screen's status line is
          the page's only one, and the heading below already says "Sample". */}
      {isSample && (
        <p className="sample-banner">
          <Info size={16} strokeWidth={2.5} aria-hidden="true" />
          <span>Sample report: fictional resume</span>
        </p>
      )}
      <div className="report-page">
        <ReportHeader
          report={results}
          isSample={isSample}
          onBack={onBack}
          titleRef={titleRef}
        />

        {wasTextTruncated && (
          <p className="truncation-notice">
            <Info size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>
              Only the first {MAX_ANALYZED_CHARACTERS.toLocaleString("en-US")}{" "}
              characters of your resume were analyzed.
            </span>
          </p>
        )}

        <VerdictBlock report={results} />
        <ReportSheet report={results} />

        {isSample && (
          <div className="sample-closing">
            <p className="sample-closing-text">
              Upload a PDF to get this report for your resume.
            </p>
            <button type="button" className="primary-btn" onClick={onStartOwn}>
              Analyze your own resume
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default DashboardView;
