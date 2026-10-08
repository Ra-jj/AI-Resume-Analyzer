import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Target,
  BarChart2,
  ShieldCheck,
  ArrowLeft,
  ClipboardList,
  Briefcase,
  Star,
  Info,
  ListChecks,
  ScanSearch,
  Check,
  Copy,
  Printer,
} from "lucide-react";

import { MAX_ANALYZED_CHARACTERS } from "../lib/limits.js";
import {
  AI_SCORE_WEIGHT_PERCENT,
  CHECKS_SCORE_WEIGHT_PERCENT,
  getScoreRating,
} from "../lib/report.js";
import { buildReportSummaryText } from "../lib/reportText.js";

const hasText = (value) => typeof value === "string" && value.length > 0;
const hasItems = (value) => Array.isArray(value) && value.length > 0;
const isScore = (value) => Number.isFinite(value);

// Cards are laid out in pairs; when one of a pair has nothing to show it is
// hidden and its partner takes the full row instead of leaving a gap.
const pairSpan = (isPartnerShown) =>
  isPartnerShown ? "col-span-6" : "col-span-12";

// The modifier class for each rating sets the colour shared by the rating
// badge, the score ring and the score bar.
const RATING_CLASS_NAMES = {
  Excellent: "score-panel--excellent",
  Good: "score-panel--good",
  "Needs Improvement": "score-panel--needs-improvement",
};

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
function ReportActions({ results, isSample }) {
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
      const summaryText = buildReportSummaryText(results);
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
          <Copy size={16} aria-hidden="true" /> Copy summary
        </button>
        <button type="button" className="report-action-btn" onClick={handlePrint}>
          <Printer size={16} aria-hidden="true" /> Print or save as PDF
        </button>
      </div>
      <p
        className={`report-action-feedback${copyStatus === "failed" ? " report-action-feedback--error" : ""}`}
        aria-live="polite"
      >
        {copyStatus === "copied" && (
          <>
            <Check size={16} aria-hidden="true" />
            <span>Summary copied</span>
          </>
        )}
        {copyStatus === "failed" && (
          <>
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{COPY_FAILED_MESSAGE}</span>
          </>
        )}
      </p>
    </>
  );
}

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
  const headingRef = useRef(null);

  useEffect(() => {
    // A new report is a new screen: start at its top, with focus on its
    // heading so screen readers announce it and Tab continues from there.
    // This screen only appears after the user chose a file, so it never
    // takes focus on page load.
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  if (!results) return null;

  const showSummary = hasText(results.executiveSummary);
  const showRoles = hasItems(results.recommendedRoles);
  const showMetrics = hasItems(results.performanceMetrics);
  const showStrengths = hasItems(results.topStrengths);
  const showImprovements = hasItems(results.mainImprovements);
  const showAtsSummary = hasText(results.atsOptimization);
  const showChecklist = hasItems(results.atsCompatibilityChecklist);
  const showAtsCard = showAtsSummary || showChecklist;
  const showInsights = hasItems(results.resumeInsights);
  const showKeywords = hasItems(results.recommendedKeywords);
  const showInsightsCard = showInsights || showKeywords;
  const showScoreBreakdown =
    isScore(results.aiScore) && isScore(results.checksScore);
  const jobMatch = results.jobMatch ?? null;
  const showJobMatch = jobMatch !== null && isScore(jobMatch.matchScore);
  const showResumeChecks = hasItems(results.resumeChecks);
  const passedCheckCount = showResumeChecks
    ? results.resumeChecks.filter((check) => check.passed).length
    : 0;

  const ratingText = getScoreRating(results.overallScore);
  const scoreRating = {
    text: ratingText,
    className: RATING_CLASS_NAMES[ratingText],
  };

  return (
    <div className="dashboard-container animate-slide-up">
      {/* Plain text, not a live region: the upload screen's status line is
          the page's only one, and the heading below already says "Sample". */}
      {isSample && (
        <p className="sample-banner">
          <Info size={16} aria-hidden="true" />
          <span>Sample report: fictional resume</span>
        </p>
      )}
      <div className="dashboard-header">
        <button type="button" className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />{" "}
          {isSample ? "Back to home" : "Analyze another resume"}
        </button>
        {/* Printed above the title instead of the buttons. */}
        <p className="print-only report-print-brand">AI Resume Analyzer</p>
        <div className="dashboard-title-row">
          <h1 ref={headingRef} className="dashboard-title" tabIndex={-1}>
            {isSample ? "Sample analysis report" : "Analysis Report"}
          </h1>
          <ReportActions results={results} isSample={isSample} />
        </div>
      </div>

      {wasTextTruncated && (
        <p className="truncation-notice">
          <Info size={16} aria-hidden="true" />
          <span>
            Only the first {MAX_ANALYZED_CHARACTERS.toLocaleString("en-US")}{" "}
            characters of your resume were analyzed.
          </span>
        </p>
      )}

      <div className="grid grid-cols-12">
        {/* Overall Score */}
        <div className="col-span-12 card flex justify-center items-center py-8">
          <div className={`score-panel ${scoreRating.className}`}>
            <div
              className="score-circle"
              style={{ "--score": `${results.overallScore}%` }}
            >
              <span className="score-value">{results.overallScore}</span>
            </div>
            <h3 className="score-label">Overall Resume Score</h3>
            {showScoreBreakdown && (
              <div className="score-breakdown">
                <p className="score-breakdown-text">
                  <span className="score-breakdown-part">
                    AI review {results.aiScore}
                  </span>
                  <span
                    className="score-breakdown-separator"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                  <span className="visually-hidden">, </span>
                  <span className="score-breakdown-part">
                    Resume checks {results.checksScore}
                  </span>
                </p>
              </div>
            )}

            <div className="score-badge">
              <Star fill="currentColor" size={16} /> {scoreRating.text}
            </div>

            <div className="score-bar">
              <div
                className="score-bar-fill"
                style={{ "--value": `${results.overallScore}%` }}
              ></div>
            </div>

            <p className="score-note">
              Combines the AI review ({AI_SCORE_WEIGHT_PERCENT}%) with automated
              resume checks ({CHECKS_SCORE_WEIGHT_PERCENT}%).
            </p>
          </div>
        </div>

        {/* Job Match: only when a job description was sent and the AI
            returned a usable comparison. */}
        {showJobMatch && (
          <div className="col-span-12 card">
            <h3 className="card-title">
              <ScanSearch size={20} /> Job Match
            </h3>
            <div className="metric-row">
              <span className="metric-name">Match with this role</span>
              <span className="metric-score">{jobMatch.matchScore}%</span>
            </div>
            <div className="metric-bar-bg">
              <div
                className="metric-bar-fill"
                style={{ "--value": `${jobMatch.matchScore}%` }}
              ></div>
            </div>
            {hasText(jobMatch.summary) && (
              <p className="summary-text job-match-summary">
                {jobMatch.summary}
              </p>
            )}
            {(hasItems(jobMatch.matchedKeywords) ||
              hasItems(jobMatch.missingKeywords)) && (
              <div className="keyword-groups">
                {hasItems(jobMatch.matchedKeywords) && (
                  <div>
                    <h4 className="keyword-group-title">
                      <CheckCircle
                        size={16}
                        color="var(--success)"
                        aria-hidden="true"
                      />
                      Matched keywords
                    </h4>
                    <div>
                      {jobMatch.matchedKeywords.map((keyword, idx) => (
                        <span className="badge badge--success" key={idx}>
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {hasItems(jobMatch.missingKeywords) && (
                  <div>
                    <h4 className="keyword-group-title">
                      <AlertTriangle
                        size={16}
                        color="var(--warning)"
                        aria-hidden="true"
                      />
                      Missing keywords
                    </h4>
                    <div>
                      {jobMatch.missingKeywords.map((keyword, idx) => (
                        <span className="badge badge--warning" key={idx}>
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Executive Summary */}
        {showSummary && (
          <div className="col-span-12 card">
            <h3 className="card-title">
              <ClipboardList size={20} /> Executive Summary
            </h3>
            <p className="summary-text">{results.executiveSummary}</p>
          </div>
        )}

        {/* Recommended Roles */}
        {showRoles && (
          <div className="col-span-12 card">
            <h3 className="card-title">
              <Briefcase size={20} /> Recommended Roles to Apply For
            </h3>
            <div className="role-list">
              {results.recommendedRoles.map((role, idx) => (
                <span className="role-chip" key={idx}>
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        {showMetrics && (
          <div className="col-span-12 card">
            <h3 className="card-title">
              <BarChart2 size={20} /> Performance Metrics
            </h3>
            <div className="metric-grid">
              {results.performanceMetrics.map((metric, idx) => (
                <div key={idx}>
                  <div className="metric-row">
                    <span className="metric-name">{metric.name}</span>
                    <span className="metric-score">{metric.score}/100</span>
                  </div>
                  <div className="metric-bar-bg">
                    <div
                      className="metric-bar-fill"
                      style={{ "--value": `${metric.score}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resume Checks: calculated in code from the resume text */}
        {showResumeChecks && (
          <div className="col-span-12 card">
            <h3 className="card-title">
              <ListChecks size={20} /> Resume Checks
            </h3>
            <p className="resume-checks-summary">
              {passedCheckCount} of {results.resumeChecks.length} checks passed
            </p>
            <ul className="resume-check-list">
              {results.resumeChecks.map((check) => (
                <li className="list-item resume-check" key={check.id}>
                  {check.passed ? (
                    <CheckCircle
                      size={18}
                      color="var(--success)"
                      className="list-item-icon"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertTriangle
                      size={18}
                      color="var(--warning)"
                      className="list-item-icon"
                      aria-hidden="true"
                    />
                  )}
                  <div className="resume-check-text">
                    <span className="resume-check-label">
                      <span className="visually-hidden">
                        {check.passed ? "Passed: " : "Needs attention: "}
                      </span>
                      {check.label}
                    </span>
                    <span className="resume-check-detail">{check.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Strengths & Improvements */}
        {showStrengths && (
          <div className={`${pairSpan(showImprovements)} card`}>
            <h3 className="card-title card-title--success">
              <CheckCircle size={20} /> Top Strengths
            </h3>
            {results.topStrengths.map((str, idx) => (
              <div className="list-item" key={idx}>
                <CheckCircle
                  size={18}
                  color="var(--success)"
                  className="list-item-icon"
                />
                <span>{str}</span>
              </div>
            ))}
          </div>
        )}

        {showImprovements && (
          <div className={`${pairSpan(showStrengths)} card`}>
            <h3 className="card-title card-title--warning">
              <AlertTriangle size={20} /> Main Improvements
            </h3>
            {results.mainImprovements.map((imp, idx) => (
              <div className="list-item" key={idx}>
                <AlertTriangle
                  size={18}
                  color="var(--warning)"
                  className="list-item-icon"
                />
                <span>{imp}</span>
              </div>
            ))}
          </div>
        )}

        {/* ATS Checklist & Insights */}
        {showAtsCard && (
          <div className={`${pairSpan(showInsightsCard)} card`}>
            <h3 className="card-title">
              <ShieldCheck size={20} /> ATS Compatibility
            </h3>
            {showAtsSummary && (
              <p className="ats-summary">{results.atsOptimization}</p>
            )}

            {results.atsCompatibilityChecklist.map((check, idx) => (
              <div
                className={`list-item checklist-item${check.passed ? "" : " checklist-item--failed"}`}
                key={idx}
              >
                {check.passed ? (
                  <CheckCircle size={18} color="var(--success)" />
                ) : (
                  <AlertTriangle size={18} color="var(--danger)" />
                )}
                <span>{check.item}</span>
              </div>
            ))}
          </div>
        )}

        {showInsightsCard && (
          <div className={`${pairSpan(showAtsCard)} card`}>
            {showInsights && (
              <>
                <h3 className="card-title card-title--secondary">
                  <Lightbulb size={20} /> Deep Insights
                </h3>
                {results.resumeInsights.map((insight, idx) => (
                  <div className="list-item" key={idx}>
                    <div className="insight-dot"></div>
                    <span>{insight}</span>
                  </div>
                ))}
              </>
            )}

            {showKeywords && (
              <>
                <h3
                  className={`card-title card-title--secondary${showInsights ? " mt-8" : ""}`}
                >
                  <Target size={20} /> Recommended Keywords
                </h3>
                <div>
                  {results.recommendedKeywords.map((kw, idx) => (
                    <span className="badge" key={idx}>
                      {kw}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isSample && (
        <div className="sample-closing">
          <p className="sample-closing-text">
            Upload a PDF to get this report for your resume.
          </p>
          <button type="button" className="gradient-btn" onClick={onStartOwn}>
            Analyze your own resume
          </button>
        </div>
      )}
    </div>
  );
}

export default DashboardView;
