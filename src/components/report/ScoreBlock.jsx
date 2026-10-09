import {
  AI_SCORE_WEIGHT_PERCENT,
  CHECKS_SCORE_WEIGHT_PERCENT,
  EXCELLENT_MIN_SCORE,
  GOOD_MIN_SCORE,
  getScoreRating,
} from "../../lib/report.js";

const isScore = (value) => Number.isFinite(value);

// The modifier class for each rating sets the colour shared by the rating
// chip and the scale's active band.
const RATING_CLASS_NAMES = {
  Excellent: "score-panel--excellent",
  Good: "score-panel--good",
  "Needs Improvement": "score-panel--needs-improvement",
};

// The scale under the score: one band per rating, cut at the thresholds in
// lib/report.js, each named by the rating of its lowest score.
const BAND_EDGES = [0, GOOD_MIN_SCORE, EXCELLENT_MIN_SCORE, 100];
const RATING_BANDS = BAND_EDGES.slice(0, -1).map((from, index) => ({
  from,
  to: BAND_EDGES[index + 1],
  rating: getScoreRating(from),
}));

// What the scale shows, for screen readers.
const RATINGS_TEXT =
  `Ratings: ${getScoreRating(0)} below ${GOOD_MIN_SCORE}, ` +
  `${getScoreRating(GOOD_MIN_SCORE)} from ${GOOD_MIN_SCORE}, ` +
  `${getScoreRating(EXCELLENT_MIN_SCORE)} from ${EXCELLENT_MIN_SCORE}.`;

/**
 * The rating bands from 0 to 100 with the current band filled and a marker
 * at the score. Drawn for sighted users only; a hidden sentence says where
 * the bands start.
 */
function RatingScale({ score, rating }) {
  return (
    <div className="score-scale">
      <p className="visually-hidden">{RATINGS_TEXT}</p>
      <div className="score-scale-track" aria-hidden="true" style={{ "--score": score }}>
        {RATING_BANDS.map((band) => (
          <span
            key={band.rating}
            className={`score-scale-band${band.rating === rating ? " score-scale-band--active" : ""}`}
            style={{ "--band-from": band.from, "--band-to": band.to }}
          />
        ))}
        <span className="score-scale-marker" />
      </div>
      <div className="score-scale-labels" aria-hidden="true">
        {BAND_EDGES.map((edge) => (
          <span key={edge} className="score-scale-label" style={{ "--at": edge }}>
            {edge}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The yellow score block: the overall score stamped large, its rating, the
 * rating scale, the two scores it blends and, when a job description was
 * analyzed, the match with the role. Shown once on the report.
 */
function ScoreBlock({ report, headingLevel }) {
  const Heading = `h${headingLevel}`;
  const score = report.overallScore;
  const rating = getScoreRating(score);
  const showBreakdown = isScore(report.aiScore) && isScore(report.checksScore);
  const jobMatch = report.jobMatch ?? null;
  const showMatch = jobMatch !== null && isScore(jobMatch.matchScore);

  return (
    <div className={`score-block score-panel ${RATING_CLASS_NAMES[rating]}`}>
      <Heading className="score-block-title">Overall score</Heading>
      <div className="score-figure">
        <span className="score-value">{score}</span>
        <span className="score-figure-side">
          <span className="score-out-of">out of 100</span>
          <span className="score-badge">{rating}</span>
        </span>
      </div>
      <RatingScale score={score} rating={rating} />
      {showBreakdown && (
        <p className="score-breakdown-text">
          <span>AI review {report.aiScore}</span>
          <span className="visually-hidden">, </span>
          <span>Resume checks {report.checksScore}</span>
        </p>
      )}
      <p className="score-note">
        Combines the AI review ({AI_SCORE_WEIGHT_PERCENT}%) with automated
        resume checks ({CHECKS_SCORE_WEIGHT_PERCENT}%).
      </p>
      {/* A paragraph, not a heading: it is one figure in the verdict. */}
      {showMatch && (
        <p className="match-mark">
          <span className="match-mark-value">{jobMatch.matchScore}%</span>{" "}
          <span className="match-mark-label">Match with this role</span>
        </p>
      )}
    </div>
  );
}

export default ScoreBlock;
