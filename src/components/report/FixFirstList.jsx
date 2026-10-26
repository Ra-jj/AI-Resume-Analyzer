import { Check } from "lucide-react";

import { FIX_FIRST_COUNT } from "../../lib/fixFirst.js";

// The line under an item that has no detail of its own: where it came from.
const SOURCE_LABELS = {
  ai: "AI review",
  check: "Automated check",
  job: "Job description",
};

/** Items numbered from `start`; the list numbers them for screen readers too. */
function FixFirstItems({ items, start, isLater = false }) {
  return (
    <ol
      className={`fix-first-list${isLater ? " fix-first-list--later" : ""}`}
      start={start}
    >
      {items.map((item, index) => (
        <li key={item.id} className="fix-first-item">
          <span className="fix-first-number" aria-hidden="true">
            {start + index}
          </span>
          <span className="fix-first-text">
            <span className="fix-first-item-title">{item.title}</span>
            <span className="fix-first-source">
              {item.detail ?? SOURCE_LABELS[item.source]}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shown instead of the lists when the to-do list is empty. Its items come
 * only from failed resume checks, the AI's main improvements and the job
 * description's missing keywords (lib/fixFirst.js), so an empty list means
 * every check passed and the AI listed no main improvements. The message says
 * no more than that: a report may have no job description, and the AI's ATS
 * checklist can still flag items in the report below.
 */
function NothingToFix() {
  return (
    <div className="fix-first-empty">
      <Check
        className="fix-first-empty-icon"
        size={36}
        strokeWidth={2.5}
        aria-hidden="true"
      />
      <div className="fix-first-empty-text">
        <p className="fix-first-empty-title">Nothing to fix first.</p>
        <p className="fix-first-empty-detail">
          Every automated check passed and the AI review suggested no main improvements.
        </p>
      </div>
    </div>
  );
}

/**
 * The ink "Fix first" panel: the first FIX_FIRST_COUNT items of the to-do
 * list (lib/fixFirst.js), then the rest under "After that", or a short
 * message when `items` is empty. headingLevel is the level of "Fix first";
 * "After that" is one below it.
 */
function FixFirstList({ items, headingLevel }) {
  const Heading = `h${headingLevel}`;
  const SubHeading = `h${headingLevel + 1}`;
  const laterItems = items.slice(FIX_FIRST_COUNT);

  return (
    <div className="fix-first">
      <Heading className="fix-first-title">Fix first</Heading>
      {items.length === 0 ? (
        <NothingToFix />
      ) : (
        <>
          <FixFirstItems items={items.slice(0, FIX_FIRST_COUNT)} start={1} />
          {laterItems.length > 0 && (
            <>
              <SubHeading className="fix-first-later-title">After that</SubHeading>
              <FixFirstItems items={laterItems} start={FIX_FIRST_COUNT + 1} isLater />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default FixFirstList;
