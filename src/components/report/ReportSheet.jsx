import { useId } from "react";
import { Check, Plus, X } from "lucide-react";

import MarkedRow from "./MarkedRow.jsx";

const hasText = (value) => typeof value === "string" && value.length > 0;
const hasItems = (value) => Array.isArray(value) && value.length > 0;
const countPassed = (list) => list.filter((item) => item.passed).length;

/** A heading-led section of the sheet; a region named by its heading. */
function ReportSection({ title, children }) {
  const headingId = useId();
  return (
    <section className="report-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="report-section-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A subsection under an h3. `count` (e.g. "5 of 6 checks passed") is a
 * mark: in the margin beside the heading on a wide sheet, under it on a
 * narrow one.
 */
function ReportBlock({ title, count = null, countClassName = "", children }) {
  return (
    <div className="report-block">
      <div className="report-block-head">
        <h3 className="report-block-title">{title}</h3>
        {count !== null && (
          <p className={`report-block-count ${countClassName}`.trim()}>{count}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function TextList({ items }) {
  return (
    <ul className="report-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Keywords to add to the resume (missing from the job match, or
 * recommended), each with a "+" insert mark.
 */
function KeywordInserts({ keywords }) {
  return (
    <ul className="keyword-list">
      {keywords.map((keyword, index) => (
        <li key={index} className="keyword keyword--missing">
          <Plus className="keyword-insert" size={14} strokeWidth={2.5} aria-hidden="true" />
          {keyword}
        </li>
      ))}
    </ul>
  );
}

/**
 * Said before a check's label instead of showing its mark, which screen
 * readers skip.
 */
function ResultLabel({ passed }) {
  return (
    <span className="visually-hidden">{passed ? "Passed: " : "Needs attention: "}</span>
  );
}

/** An ink tick for a passed check, a yellow "Fix" flag for a failed one. */
function ResultMark({ passed }) {
  return passed ? (
    <Check className="pass-mark" size={26} strokeWidth={2.5} aria-hidden="true" />
  ) : (
    <span className="fix-flag" aria-hidden="true">
      <X size={14} strokeWidth={2.5} />
      Fix
    </span>
  );
}

function JobMatchSection({ jobMatch }) {
  return (
    <ReportSection title="Job match">
      {hasText(jobMatch.summary) && <p className="report-prose">{jobMatch.summary}</p>}
      {hasItems(jobMatch.matchedKeywords) && (
        <ReportBlock title="Matched keywords">
          <ul className="keyword-list">
            {jobMatch.matchedKeywords.map((keyword, index) => (
              <li key={index} className="keyword keyword--matched">
                {keyword}
              </li>
            ))}
          </ul>
        </ReportBlock>
      )}
      {hasItems(jobMatch.missingKeywords) && (
        <ReportBlock title="Missing keywords">
          <KeywordInserts keywords={jobMatch.missingKeywords} />
        </ReportBlock>
      )}
    </ReportSection>
  );
}

function WritingQualitySection({ report }) {
  return (
    <ReportSection title="Writing quality">
      {hasItems(report.performanceMetrics) && (
        <ul className="marked-list">
          {report.performanceMetrics.map((metric, index) => (
            <MarkedRow
              key={index}
              mark={
                <span className="margin-mark">
                  {metric.score}
                  <span className="margin-mark-unit">/100</span>
                </span>
              }
            >
              <span className="metric-name">{metric.name}</span>
              <span className="metric-bar" aria-hidden="true">
                <span className="metric-bar-fill" style={{ "--value": `${metric.score}%` }} />
              </span>
            </MarkedRow>
          ))}
        </ul>
      )}
      {hasItems(report.topStrengths) && (
        <ReportBlock title="Top strengths">
          <TextList items={report.topStrengths} />
        </ReportBlock>
      )}
      {hasItems(report.resumeInsights) && (
        <ReportBlock title="Insights">
          <TextList items={report.resumeInsights} />
        </ReportBlock>
      )}
    </ReportSection>
  );
}

function StructureSection({ report }) {
  const checks = report.resumeChecks;
  const checklist = report.atsCompatibilityChecklist;
  const showChecklist = hasItems(checklist);

  return (
    <ReportSection title="Structure and ATS">
      {/* Calculated in code from the resume text. */}
      {hasItems(checks) && (
        <ReportBlock
          title="Resume checks"
          count={`${countPassed(checks)} of ${checks.length} checks passed`}
          countClassName="resume-checks-summary"
        >
          <ul className="marked-list">
            {checks.map((check) => (
              <MarkedRow key={check.id} mark={<ResultMark passed={check.passed} />}>
                <span className="check-label">
                  <ResultLabel passed={check.passed} />
                  {check.label}
                </span>
                <span className="check-detail">{check.detail}</span>
              </MarkedRow>
            ))}
          </ul>
        </ReportBlock>
      )}
      {(hasText(report.atsOptimization) || showChecklist) && (
        <ReportBlock
          title="ATS compatibility"
          count={showChecklist ? `${countPassed(checklist)} of ${checklist.length} passed` : null}
        >
          {hasText(report.atsOptimization) && (
            <p className="report-prose">{report.atsOptimization}</p>
          )}
          {showChecklist && (
            <ul className="marked-list">
              {checklist.map((item, index) => (
                <MarkedRow key={index} mark={<ResultMark passed={item.passed} />}>
                  <span className="check-label">
                    <ResultLabel passed={item.passed} />
                    {item.item}
                  </span>
                </MarkedRow>
              ))}
            </ul>
          )}
        </ReportBlock>
      )}
    </ReportSection>
  );
}

function KeywordsSection({ report }) {
  return (
    <ReportSection title="Keywords and roles">
      {hasItems(report.recommendedKeywords) && (
        <ReportBlock title="Recommended keywords">
          <KeywordInserts keywords={report.recommendedKeywords} />
        </ReportBlock>
      )}
      {hasItems(report.recommendedRoles) && (
        <ReportBlock title="Roles to apply for">
          <ul className="role-list">
            {report.recommendedRoles.map((role, index) => (
              <li key={index} className="role-tag">
                {role}
              </li>
            ))}
          </ul>
        </ReportBlock>
      )}
    </ReportSection>
  );
}

/**
 * The reviewed sheet: the executive summary as its lede, then the job
 * match, writing quality, structure and ATS, and keywords and roles. The
 * AI's main improvements are not repeated here: they are in "Fix first".
 * Every part with nothing to show is left out; with nothing at all, so is
 * the sheet.
 */
function ReportSheet({ report }) {
  const jobMatch = report.jobMatch ?? null;
  const showSummary = hasText(report.executiveSummary);
  // The match percentage is in the score block; this section only appears
  // when there is more to say about the match.
  const showJobMatch =
    jobMatch !== null &&
    Number.isFinite(jobMatch.matchScore) &&
    (hasText(jobMatch.summary) ||
      hasItems(jobMatch.matchedKeywords) ||
      hasItems(jobMatch.missingKeywords));
  const showWritingQuality =
    hasItems(report.performanceMetrics) ||
    hasItems(report.topStrengths) ||
    hasItems(report.resumeInsights);
  const showStructure =
    hasItems(report.resumeChecks) ||
    hasText(report.atsOptimization) ||
    hasItems(report.atsCompatibilityChecklist);
  const showKeywords =
    hasItems(report.recommendedKeywords) || hasItems(report.recommendedRoles);

  if (!(showSummary || showJobMatch || showWritingQuality || showStructure || showKeywords)) {
    return null;
  }

  return (
    <div className="report-sheet">
      <div className="report-sheet-inner">
        {showSummary && (
          <div className="report-lede">
            <p>{report.executiveSummary}</p>
          </div>
        )}
        {showJobMatch && <JobMatchSection jobMatch={jobMatch} />}
        {showWritingQuality && <WritingQualitySection report={report} />}
        {showStructure && <StructureSection report={report} />}
        {showKeywords && <KeywordsSection report={report} />}
      </div>
    </div>
  );
}

export default ReportSheet;
