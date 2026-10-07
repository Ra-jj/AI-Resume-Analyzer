import { Check } from "lucide-react";

// The steps of one analysis, in order. "building" is never the current
// stage: the report is built in the same task the AI's reply arrives, and
// the dashboard replaces this screen at that moment. It is listed so the
// user can see what follows the AI step.
const ANALYSIS_STEPS = [
  { stage: "reading", label: "Reading your PDF" },
  { stage: "analyzing", label: "Analyzing with AI" },
  { stage: "building", label: "Building your report" },
];

const stepIndexOf = (stage) =>
  ANALYSIS_STEPS.findIndex((step) => step.stage === stage);

/**
 * The polite status line that tells screen readers which step is running,
 * e.g. "Analyzing with AI, step 2 of 3". The upload screen renders it all the
 * time, empty while `stage` is null: a live region added with its text
 * already inside isn't announced by every screen reader, so the region has
 * to exist before the first step's text arrives. It is the only live region
 * for the steps; the visible step list (AnalysisProgress) isn't one, so no
 * step is announced twice.
 */
export function AnalysisStatus({ stage }) {
  const index = stepIndexOf(stage);
  return (
    <p className="visually-hidden" role="status">
      {index === -1
        ? ""
        : `${ANALYSIS_STEPS[index].label}, step ${index + 1} of ${ANALYSIS_STEPS.length}`}
    </p>
  );
}

/**
 * Loading screen for an analysis in progress: the steps, with the current
 * one marked. `stage` is the current step's key from ANALYSIS_STEPS.
 */
function AnalysisProgress({ stage }) {
  const currentIndex = Math.max(0, stepIndexOf(stage));

  return (
    <div className="loading-container animate-slide-up">
      <div className="spinner-ring" aria-hidden="true"></div>
      <h2 className="loading-title">Analyzing Your Resume</h2>
      <ol className="progress-steps">
        {ANALYSIS_STEPS.map((step, index) => {
          const state =
            index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          return (
            <li
              key={step.stage}
              className={`progress-step progress-step--${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="progress-step-marker" aria-hidden="true">
                {state === "done" && <Check size={14} strokeWidth={3} />}
              </span>
              <span>
                {state === "done" && <span className="visually-hidden">Done: </span>}
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default AnalysisProgress;
