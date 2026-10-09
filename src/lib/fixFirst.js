// The report's to-do list: what to change in the resume, most urgent first.
// Pure: no DOM, React or Puter.

/** How many items at the top of the list the report shows as "Fix first". */
export const FIX_FIRST_COUNT = 3;

// Failed resume checks that go before the AI's improvements: without them a
// recruiter or an ATS may not be able to read or reach the resume at all.
const LEADING_CHECK_IDS = ["email", "phone", "sections"];
// Failed resume checks that go after the AI's improvements and the job
// description's missing keywords, in this order.
const TRAILING_CHECK_IDS = ["quantified-results", "length", "profile-link"];

// Titles for the checks in lib/resumeChecks.js. A failed check with any
// other id uses its own label and goes at the end of the list.
const CHECK_TITLES = {
  email: "Add an email address",
  phone: "Add a phone number",
  sections: "Use standard section headings",
  "quantified-results": "Add measurable results",
  length: "Adjust the length",
  "profile-link": "Add a LinkedIn or portfolio link",
};

const hasText = (value) => typeof value === "string" && value.trim().length > 0;
// Each title and detail is shown on one line of the list, so line breaks
// and runs of whitespace inside it are collapsed to single spaces.
const toSingleLine = (text) => text.replace(/\s+/g, " ").trim();

function textItems(list) {
  return Array.isArray(list) ? list.filter(hasText).map(toSingleLine) : [];
}

function failedChecksOf(report) {
  if (!Array.isArray(report.resumeChecks)) return [];
  return report.resumeChecks.filter(
    (check) => check !== null && typeof check === "object" && check.passed !== true,
  );
}

function checkItem(check, title, id = `check-${check.id}`) {
  return {
    id,
    title,
    source: "check",
    detail: hasText(check.detail) ? `Automated check: ${toSingleLine(check.detail)}` : null,
  };
}

/** One item per failed check with one of `ids`, in the order of `ids`. */
function knownCheckItems(failedChecks, ids) {
  return ids.flatMap((id) =>
    failedChecks
      .filter((check) => check.id === id)
      .map((check) => checkItem(check, CHECK_TITLES[id])),
  );
}

function unknownCheckItems(failedChecks) {
  return failedChecks
    .filter((check) => !Object.hasOwn(CHECK_TITLES, check.id) && hasText(check.label))
    .map((check, index) =>
      checkItem(
        check,
        toSingleLine(check.label),
        hasText(check.id) ? `check-${check.id.trim()}` : `check-other-${index}`,
      ),
    );
}

/**
 * The same items, with a "-2", "-3", … suffix on any id already used by an
 * earlier item, so every id can serve as a React key. Repeated or unknown
 * check ids can otherwise produce the same id twice.
 */
function withUniqueIds(items) {
  const usedIds = new Set();
  return items.map((item) => {
    let id = item.id;
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${item.id}-${suffix}`;
    usedIds.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

function jobMatchItems(jobMatch) {
  const missingKeywords = textItems(jobMatch?.missingKeywords);
  if (missingKeywords.length === 0) return [];
  return [
    {
      id: "job-missing-keywords",
      title: "Add keywords the job description asks for",
      source: "job",
      detail: `Job description: ${missingKeywords.join(", ")}`,
    },
  ];
}

/**
 * Everything the report suggests changing, as one ordered list of
 * { id, title, source, detail }, where source is "check", "ai" or "job":
 * failed email, phone and section checks; then the AI's main improvements
 * in its own order; then one item for the job description's missing
 * keywords; then the other failed checks, any check this file doesn't know
 * last. Passed checks and the ATS checklist are not included. The first
 * FIX_FIRST_COUNT items are the ones to fix first. Every id is unique, and
 * every title and detail is a single line.
 */
export function buildFixFirstList(report) {
  if (report === null || typeof report !== "object") return [];
  const failedChecks = failedChecksOf(report);
  const aiItems = textItems(report.mainImprovements).map((improvement, index) => ({
    id: `ai-${index}`,
    title: improvement,
    source: "ai",
    detail: null,
  }));

  return withUniqueIds([
    ...knownCheckItems(failedChecks, LEADING_CHECK_IDS),
    ...aiItems,
    ...jobMatchItems(report.jobMatch),
    ...knownCheckItems(failedChecks, TRAILING_CHECK_IDS),
    ...unknownCheckItems(failedChecks),
  ]);
}
