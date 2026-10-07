// The report as plain text, for the dashboard's "Copy summary" button.
// Pure: no DOM, React or Puter.
import { getScoreRating } from "./report.js";

const TITLE = "AI Resume Analyzer report";

const isScore = (value) => Number.isFinite(value);
const hasText = (value) => typeof value === "string" && value.trim().length > 0;
// List items and keywords go on one line each, so any line breaks or runs of
// whitespace inside them are collapsed.
const toSingleLine = (text) => text.replace(/\s+/g, " ").trim();

function textItems(list) {
  return Array.isArray(list) ? list.filter(hasText).map(toSingleLine) : [];
}

function resumeChecksOf(report) {
  return Array.isArray(report.resumeChecks)
    ? report.resumeChecks.filter((check) => hasText(check?.label))
    : [];
}

/** A titled block, or null when it has no lines (so it is left out). */
function section(title, lines) {
  return lines.length > 0 ? [title, ...lines].join("\n") : null;
}

function scoreLines(report) {
  const lines = [];
  if (isScore(report.overallScore)) {
    lines.push(
      `Overall score: ${report.overallScore}/100 (${getScoreRating(report.overallScore)})`,
    );
  }
  if (isScore(report.aiScore)) lines.push(`AI review: ${report.aiScore}/100`);
  if (isScore(report.checksScore)) {
    const checks = resumeChecksOf(report);
    const passedCount = checks.filter((check) => check.passed === true).length;
    const passedNote =
      checks.length > 0 ? ` (${passedCount} of ${checks.length} passed)` : "";
    lines.push(`Resume checks: ${report.checksScore}/100${passedNote}`);
  }
  return lines;
}

function checksNeedingAttention(report) {
  return resumeChecksOf(report)
    .filter((check) => check.passed !== true)
    .map((check) => {
      const label = toSingleLine(check.label);
      return hasText(check.detail)
        ? `- ${label}: ${toSingleLine(check.detail)}`
        : `- ${label}`;
    });
}

function jobMatchLines(jobMatch) {
  if (!jobMatch || !isScore(jobMatch.matchScore)) return [];
  const lines = [`Match with this role: ${jobMatch.matchScore}%`];
  const missingKeywords = textItems(jobMatch.missingKeywords);
  if (missingKeywords.length > 0) {
    lines.push(`Missing keywords: ${missingKeywords.join(", ")}`);
  }
  return lines;
}

/**
 * Plain-text summary of a dashboard report (see buildReport in report.js):
 * the scores, executive summary, main improvements, the resume checks that
 * need attention, the job match (when there is one) and the recommended
 * keywords. Blocks are separated by a blank line, and a block with nothing
 * to show is left out.
 */
export function buildReportSummaryText(report) {
  if (report === null || typeof report !== "object") {
    throw new TypeError(
      `buildReportSummaryText expected a report object, received ${report === null ? "null" : typeof report}`,
    );
  }

  const recommendedKeywords = textItems(report.recommendedKeywords);
  const blocks = [
    TITLE,
    section("Scores", scoreLines(report)),
    section(
      "Executive summary",
      hasText(report.executiveSummary) ? [report.executiveSummary.trim()] : [],
    ),
    section(
      "Main improvements",
      textItems(report.mainImprovements).map((item) => `- ${item}`),
    ),
    section("Resume checks that need attention", checksNeedingAttention(report)),
    section("Job match", jobMatchLines(report.jobMatch)),
    recommendedKeywords.length > 0
      ? `Recommended keywords: ${recommendedKeywords.join(", ")}`
      : null,
  ];
  return blocks.filter((block) => block !== null).join("\n\n");
}
