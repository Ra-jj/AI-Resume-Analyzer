// Combines the AI's analysis with the automated resume checks into the
// report the dashboard shows.

// Share of the overall score, in percent, that comes from each part. Whole
// percentages keep the blend in integer arithmetic, so it rounds exactly.
export const AI_SCORE_WEIGHT_PERCENT = 70;
export const CHECKS_SCORE_WEIGHT_PERCENT = 30;

function clampScore(score, name) {
  if (!Number.isFinite(score)) {
    throw new TypeError(`${name} must be a finite number, received ${String(score)}`);
  }
  return Math.min(100, Math.max(0, score));
}

// Lowest overall score for each rating; anything below "Good" is "Needs
// Improvement".
const EXCELLENT_MIN_SCORE = 80;
const GOOD_MIN_SCORE = 60;

/** The rating shown next to an overall score: "Excellent", "Good" or "Needs Improvement". */
export function getScoreRating(score) {
  if (score >= EXCELLENT_MIN_SCORE) return "Excellent";
  if (score >= GOOD_MIN_SCORE) return "Good";
  return "Needs Improvement";
}

/** round(0.7 × AI score + 0.3 × checks score), both clamped to 0–100. */
export function combineScores(aiScore, checksScore) {
  const weightedTotal =
    AI_SCORE_WEIGHT_PERCENT * clampScore(aiScore, "aiScore") +
    CHECKS_SCORE_WEIGHT_PERCENT * clampScore(checksScore, "checksScore");
  return Math.round(weightedTotal / 100);
}

/**
 * The dashboard report: the normalized AI analysis with its own score kept
 * as `aiScore`, the checks and their score added, and `overallScore`
 * replaced by the blend of the two.
 */
export function buildReport(analysis, resumeCheckResult) {
  return {
    ...analysis,
    overallScore: combineScores(analysis.overallScore, resumeCheckResult.score),
    aiScore: analysis.overallScore,
    checksScore: resumeCheckResult.score,
    resumeChecks: resumeCheckResult.checks,
  };
}
