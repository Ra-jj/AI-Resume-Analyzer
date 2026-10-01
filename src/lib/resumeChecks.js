// Automated resume checks that read the extracted text directly, without the
// AI. pdf.js text keeps no bullets or layout (a page is mostly one long
// line), so every pattern here works on flat text, and each one leans
// towards not claiming a match it can't see clearly.

const MIN_RESUME_WORDS = 300;
const MAX_RESUME_WORDS = 1000;
const MIN_QUANTIFIED_RESULTS = 3;

// Phone numbers: E.164 allows at most 15 digits; 10 covers national
// numbers with an area code.
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
// Longest found value (email, phone, link) echoed back in a check's detail.
const MAX_DETAIL_VALUE_LENGTH = 60;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;

// Links written with a scheme or "www.".
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]{}]+/gi;
// Anything shaped like a domain, with or without a path (linkedin.com/in/x,
// Node.js). Blanked before counting results so "CA 94107 linkedin.com/…"
// doesn't read as "94107 l…". Needs letters after the last dot, so numbers
// such as 2.4M and 3.11 are left alone.
const DOMAIN_LIKE_PATTERN =
  /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b(?:\/[^\s<>"'()[\]{}]*)?/g;

const PROFILE_LINK_PATTERNS = [
  /\b(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i,
  /\b(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9-]+/i,
  /\b[A-Za-z0-9-]+\.github\.io\b/i,
  // Any link written with a scheme or "www.".
  /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]{}]+/i,
  // A bare domain followed by a path, e.g. behance.net/jane or jane.com/work.
  // A bare "company.com" without a path is usually an employer, not a link.
  /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|net|org|io|dev|me|co|app|site|page|tech|design|xyz|ai)\/[^\s<>"'()[\]{}]+/i,
  // A bare domain on a TLD that is mostly used for personal sites.
  /\b[a-z0-9][a-z0-9-]*\.(?:dev|me|page|site|design|portfolio)\b/,
];

// Digit groups that may form a phone number: an optional "+country code",
// an optional "(area code)", then groups joined by spaces, dots or dashes.
// Parentheses only open a number, so "CA 94107 (415) 555-2671" yields the
// ZIP code and the phone number as separate candidates.
const PHONE_CANDIDATE_PATTERN =
  /(?:\+\s?\d{1,4}[ .-]{0,3})?(?:\(\d{1,5}\)[ .-]{0,3})?\d{1,12}(?:[ .-]{1,3}\d{1,12}){0,6}/g;
const YEAR_GROUP_PATTERN = /^(?:19|20)\d{2}$/;
// A full date with a four-digit year, either way round: 15.03.2021,
// 3/15/2021, 2021-03-15. A phone-shaped run containing one is a date range
// ("15.03.2021 - 30.06.2023"), not a phone number. Only full dates count,
// so a French number such as 01.23.45.67.89 is still a phone number.
const FULL_DATE_PATTERNS = [
  /(?:^|\D)\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}(?!\d)/,
  /(?:^|\D)(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}(?!\d)/,
];

// Dates such as 03/2021, 2021-03, 2021-03-15 and 15.03.2021.
const DATE_PATTERN =
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}[/.-]\d{1,2}(?:[/.-]\d{1,2})?\b|\b\d{1,2}[/.-]\d{4}\b/g;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;

// Small words that follow a number in tool versions and ranges ("Java 17
// and", "from 40 to"), which are not results.
const NON_RESULT_FOLLOWERS =
  "and|or|to|of|in|at|on|for|with|by|from|the|a|an|as|is|was|vs";

// Each alternative is one way a result can be quantified. Matching is
// left to right, so "$2.5M" counts once, as currency.
const QUANTIFIED_RESULT_PATTERN = new RegExp(
  [
    // Currency: $2.5M, €40k, £1,200, $3 million
    String.raw`[$€£¥₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmMbB]|bn|mm|MM|million|billion|thousand)\b)?`,
    // Percentages: 40%, 12.5 %, 30 percent
    String.raw`\b\d+(?:\.\d+)?\s?(?:%|percent\b|per cent\b)`,
    // Abbreviated amounts and multipliers: 50k, 2M, 1.5B, 3x
    String.raw`\b\d+(?:\.\d+)?(?:[kKMB]|bn|x|X)\b`,
    // Lower bounds: 10+
    String.raw`\b\d+\+`,
    // Multi-digit numbers followed by a lowercase word: 12 engineers, 300 ms, 1,200 users
    String.raw`\b(?:\d{1,3}(?:,\d{3})+|\d{2,})(?:\.\d+)?\s+(?!(?:${NON_RESULT_FOLLOWERS})\b)[a-z]`,
  ].join("|"),
  "g",
);

// Section headings must be in Title Case or capitals: in flat text that is
// what separates "Experience" the heading from "8 years of experience".
const SECTIONS = [
  {
    name: "Experience",
    pattern:
      /\b(?:Experience|EXPERIENCE|Employment|EMPLOYMENT|Work History|WORK HISTORY)\b|\b(?:Work|Professional|Relevant|Career) (?:experience|history)\b/,
  },
  { name: "Education", pattern: /\b(?:Education|EDUCATION)\b/ },
  { name: "Skills", pattern: /\b(?:Skills|SKILLS)\b/ },
];

const formatNumber = (value) => value.toLocaleString("en-US");

function shortenForDetail(value) {
  return value.length > MAX_DETAIL_VALUE_LENGTH
    ? `${value.slice(0, MAX_DETAIL_VALUE_LENGTH - 1)}…`
    : value;
}

function countWords(text) {
  // Bullet glyphs and dashes extracted as separate tokens aren't words.
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function trimTrailingPunctuation(value) {
  return value.replace(/[.,;:!?]+$/, "");
}

/**
 * Turns one phone-shaped match into a phone number, or null. The run is cut
 * at the first full date it contains. Trailing year groups are then
 * dropped ("(415) 555-2671 2019" from a date range that follows the
 * number), and a run made mostly of years ("2015 - 2019 2019") is rejected.
 */
function toPhoneNumber(fullCandidate) {
  // Everything from the first full date on is a date, not part of a number:
  // "15.03.2021 - 30.06.2023" leaves nothing, "(415) 555-2671 15.03.2021"
  // leaves the phone number.
  const dateStart = Math.min(
    ...FULL_DATE_PATTERNS.map((pattern) => fullCandidate.match(pattern)?.index ?? Infinity),
  );
  const candidate =
    dateStart === Infinity ? fullCandidate : fullCandidate.slice(0, dateStart);

  const groups = [...candidate.matchAll(/\d+/g)];
  const digitCount = (list) => list.reduce((sum, group) => sum + group[0].length, 0);

  while (
    groups.length > 1 &&
    YEAR_GROUP_PATTERN.test(groups[groups.length - 1][0]) &&
    digitCount(groups.slice(0, -1)) >= MIN_PHONE_DIGITS
  ) {
    groups.pop();
  }

  const digits = digitCount(groups);
  if (digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) return null;

  const yearGroups = groups.filter((group) => YEAR_GROUP_PATTERN.test(group[0])).length;
  if (yearGroups * 2 >= groups.length) return null;

  const lastGroup = groups[groups.length - 1];
  return candidate.slice(0, lastGroup.index + lastGroup[0].length);
}

const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

/**
 * False when the match is glued to a word or a longer number on either
 * side, e.g. "ISO27001" or the first 12 digits of a 16-digit number.
 */
function isStandalone(text, start, length) {
  const before = start > 0 ? text[start - 1] : " ";
  const after = start + length < text.length ? text[start + length] : " ";
  return !WORD_CHARACTER_PATTERN.test(before) && !WORD_CHARACTER_PATTERN.test(after);
}

function findPhoneNumber(text) {
  for (const match of text.matchAll(PHONE_CANDIDATE_PATTERN)) {
    if (!isStandalone(text, match.index, match[0].length)) continue;
    const phoneNumber = toPhoneNumber(match[0]);
    if (phoneNumber) return phoneNumber;
  }
  return null;
}

function findProfileLink(textWithoutEmails) {
  for (const pattern of PROFILE_LINK_PATTERNS) {
    const match = textWithoutEmails.match(pattern);
    if (match) return trimTrailingPunctuation(match[0]);
  }
  return null;
}

/**
 * Blanks out everything numeric that is not an achievement (emails, links,
 * phone numbers, dates and years), then counts what is left.
 */
function countQuantifiedResults(text) {
  let remaining = text
    .replace(EMAIL_PATTERN, " ")
    .replace(URL_PATTERN, " ")
    .replace(DOMAIN_LIKE_PATTERN, " ");

  remaining = remaining.replace(PHONE_CANDIDATE_PATTERN, (candidate, offset, whole) => {
    if (!isStandalone(whole, offset, candidate.length)) return candidate;
    const phoneNumber = toPhoneNumber(candidate);
    if (!phoneNumber) return candidate;
    // Blank only the phone itself; anything trimmed off (a trailing year)
    // is handled by the date and year patterns below.
    return " " + candidate.slice(phoneNumber.length);
  });

  remaining = remaining.replace(DATE_PATTERN, " ").replace(YEAR_PATTERN, " ");
  return remaining.match(QUANTIFIED_RESULT_PATTERN)?.length ?? 0;
}

function checkLength(text) {
  const words = countWords(text);
  const passed = words >= MIN_RESUME_WORDS && words <= MAX_RESUME_WORDS;
  const wordLabel = `${formatNumber(words)} ${words === 1 ? "word" : "words"}`;
  return {
    id: "length",
    label: "Resume length",
    passed,
    detail: passed
      ? wordLabel
      : `${wordLabel} — aim for ${formatNumber(MIN_RESUME_WORDS)}–${formatNumber(MAX_RESUME_WORDS)}`,
  };
}

function checkQuantifiedResults(text) {
  const count = countQuantifiedResults(text);
  const passed = count >= MIN_QUANTIFIED_RESULTS;
  const found =
    count === 0
      ? "No measurable results found"
      : `${count} measurable ${count === 1 ? "result" : "results"} found`;
  return {
    id: "quantified-results",
    label: "Measurable results",
    passed,
    detail: passed ? found : `${found} — aim for at least ${MIN_QUANTIFIED_RESULTS}`,
  };
}

function checkEmail(text) {
  const email = text.match(EMAIL_PATTERN)?.[0] ?? null;
  return {
    id: "email",
    label: "Email address",
    passed: email !== null,
    detail: email ? shortenForDetail(email) : "No email address found",
  };
}

function checkPhone(text) {
  const phoneNumber = findPhoneNumber(text);
  return {
    id: "phone",
    label: "Phone number",
    passed: phoneNumber !== null,
    detail: phoneNumber ? shortenForDetail(phoneNumber) : "No phone number found",
  };
}

function checkProfileLink(text) {
  const link = findProfileLink(text.replace(EMAIL_PATTERN, " "));
  return {
    id: "profile-link",
    label: "LinkedIn or portfolio link",
    passed: link !== null,
    detail: link
      ? shortenForDetail(link)
      : "No LinkedIn, GitHub or portfolio link found",
  };
}

function checkSections(text) {
  const missing = SECTIONS.filter(({ pattern }) => !pattern.test(text)).map(
    ({ name }) => name,
  );
  return {
    id: "sections",
    label: "Standard sections",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? "Experience, Education and Skills found"
        : `Missing: ${missing.join(", ")}`,
  };
}

/**
 * Runs every check on the resume text. Returns the checks, each with a short
 * detail to show the user, and a score: the percentage that passed, rounded.
 */
export function runResumeChecks(text) {
  // No email, phone number, link or result is 200 characters without a
  // space. Blanking such runs first keeps every pattern below fast on
  // pathological text (one 100,000-character token took over a minute).
  const resumeText =
    typeof text === "string" ? text.replace(/\S{200,}/g, " ") : "";
  const checks = [
    checkLength(resumeText),
    checkQuantifiedResults(resumeText),
    checkEmail(resumeText),
    checkPhone(resumeText),
    checkProfileLink(resumeText),
    checkSections(resumeText),
  ];
  const passedCount = checks.filter((check) => check.passed).length;
  return { score: Math.round((100 * passedCount) / checks.length), checks };
}
