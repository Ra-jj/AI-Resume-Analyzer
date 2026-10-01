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
} from "lucide-react";

import { MAX_ANALYZED_CHARACTERS } from "../lib/limits.js";

const hasText = (value) => typeof value === "string" && value.length > 0;
const hasItems = (value) => Array.isArray(value) && value.length > 0;

// Cards are laid out in pairs; when one of a pair has nothing to show it is
// hidden and its partner takes the full row instead of leaving a gap.
const pairSpan = (isPartnerShown) =>
  isPartnerShown ? "col-span-6" : "col-span-12";

function DashboardView({ results, wasTextTruncated, onBack }) {
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

  // The modifier class sets the colour shared by the rating badge and the
  // score bar.
  const scoreRating =
    results.overallScore >= 80
      ? { text: "Excellent", className: "score-panel--excellent" }
      : results.overallScore >= 60
        ? { text: "Good", className: "score-panel--good" }
        : {
            text: "Needs Improvement",
            className: "score-panel--needs-improvement",
          };

  return (
    <div className="dashboard-container animate-slide-up">
      <div className="dashboard-header">
        <button type="button" className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Analyze another resume
        </button>
        <h2 className="dashboard-title">Analysis Report</h2>
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
              Score based on content quality, formatting, and keyword usage
            </p>
          </div>
        </div>

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
    </div>
  );
}

export default DashboardView;
