import { memo } from "react";

import { getSampleReport } from "../../lib/sampleReport.js";
import ErrorBoundary from "../ErrorBoundary.jsx";
import VerdictBlock from "../report/VerdictBlock.jsx";

/**
 * The top of the sample report, drawn by the report's own VerdictBlock. The
 * sample is read here, while rendering inside the boundary below, so a
 * failure building it leaves the preview out instead of breaking the page.
 */
function SamplePreviewContent() {
  return (
    <>
      <p className="sample-intro">
        This is the top of a real report, made from a fictional data
        analyst&apos;s resume and a fictional job description.
      </p>
      {/* At full size and in its final state: the stylesheet turns off the
          sweep and stamp that play when a report opens. */}
      <div className="sample-preview">
        <VerdictBlock report={getSampleReport()} headingLevel={3} />
      </div>
    </>
  );
}

// The sample never changes. memo keeps the upload screen's re-renders (one
// per keystroke in the job description) from re-rendering it.
const SamplePreview = memo(function SamplePreview() {
  return (
    <ErrorBoundary name="sample-preview" fallback={null}>
      <SamplePreviewContent />
    </ErrorBoundary>
  );
});

/**
 * "Sample report" on the home page: the top of the fictional sample report,
 * then the button that opens all of it. Nothing in the preview is
 * focusable, so Tab goes from the file input straight to the button.
 * buttonRef lets the upload screen return focus to the button when the
 * user leaves the sample.
 */
function SampleSection({ buttonRef, onOpenSample }) {
  return (
    <section className="page-width sample-section" aria-labelledby="sample-section-title">
      <div className="sample-section-head">
        <h2 id="sample-section-title" className="section-title">
          Sample report
        </h2>
        <p className="sample-tag">Fictional resume</p>
      </div>
      <SamplePreview />
      <button
        ref={buttonRef}
        type="button"
        className="report-action-btn sample-open-btn"
        onClick={onOpenSample}
      >
        See a full sample report
      </button>
    </section>
  );
}

export default SampleSection;
