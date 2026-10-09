import { describe, expect, it } from "vitest";

import { FIX_FIRST_COUNT, buildFixFirstList } from "./fixFirst.js";
import { runResumeChecks } from "./resumeChecks.js";

const check = (id, passed, detail = `${id} detail`, label = `${id} label`) => ({
  id,
  label,
  passed,
  detail,
});

const ALL_FAILED_CHECKS = [
  // The order runResumeChecks returns them in, which the list must not follow.
  check("length", false, "148 words. Aim for 300 to 1,000."),
  check("quantified-results", false, "2 measurable results found. Aim for at least 3."),
  check("email", false, "No email address found"),
  check("phone", false, "No phone number found"),
  check("profile-link", false, "No LinkedIn, GitHub or portfolio link found"),
  check("sections", false, "Missing: Skills"),
];

const FULL_REPORT = {
  overallScore: 50,
  mainImprovements: ["Lead with results", "Trim the summary", "Group the skills"],
  resumeChecks: ALL_FAILED_CHECKS,
  jobMatch: {
    matchScore: 40,
    summary: "Partial fit.",
    matchedKeywords: ["SQL"],
    missingKeywords: ["Python", "A/B testing"],
  },
  atsCompatibilityChecklist: [{ item: "Clear Contact Info", passed: false }],
};

describe("buildFixFirstList", () => {
  it("orders contact and section checks, then AI improvements, then job keywords, then the other checks", () => {
    expect(buildFixFirstList(FULL_REPORT)).toEqual([
      { id: "check-email", title: "Add an email address", source: "check", detail: "Automated check: No email address found" },
      { id: "check-phone", title: "Add a phone number", source: "check", detail: "Automated check: No phone number found" },
      { id: "check-sections", title: "Use standard section headings", source: "check", detail: "Automated check: Missing: Skills" },
      { id: "ai-0", title: "Lead with results", source: "ai", detail: null },
      { id: "ai-1", title: "Trim the summary", source: "ai", detail: null },
      { id: "ai-2", title: "Group the skills", source: "ai", detail: null },
      {
        id: "job-missing-keywords",
        title: "Add keywords the job description asks for",
        source: "job",
        detail: "Job description: Python, A/B testing",
      },
      {
        id: "check-quantified-results",
        title: "Add measurable results",
        source: "check",
        detail: "Automated check: 2 measurable results found. Aim for at least 3.",
      },
      { id: "check-length", title: "Adjust the length", source: "check", detail: "Automated check: 148 words. Aim for 300 to 1,000." },
      {
        id: "check-profile-link",
        title: "Add a LinkedIn or portfolio link",
        source: "check",
        detail: "Automated check: No LinkedIn, GitHub or portfolio link found",
      },
    ]);
  });

  it("uses a title for every check id runResumeChecks produces", () => {
    const { checks } = runResumeChecks("");
    expect(checks.every((resumeCheck) => resumeCheck.passed === false)).toBe(true);
    const items = buildFixFirstList({ resumeChecks: checks });
    expect(items.map((item) => item.id).sort()).toEqual(
      checks.map((resumeCheck) => `check-${resumeCheck.id}`).sort(),
    );
    // A known id never falls back to the check's own label.
    for (const resumeCheck of checks) {
      expect(items.map((item) => item.title)).not.toContain(resumeCheck.label);
    }
  });

  it("leaves out passed checks and the ATS checklist", () => {
    const report = {
      ...FULL_REPORT,
      resumeChecks: ALL_FAILED_CHECKS.map((resumeCheck) => ({ ...resumeCheck, passed: true })),
    };
    expect(buildFixFirstList(report).map((item) => item.source)).toEqual([
      "ai",
      "ai",
      "ai",
      "job",
    ]);
  });

  it("returns an empty list when every check passed and nothing else is suggested", () => {
    expect(
      buildFixFirstList({
        mainImprovements: [],
        resumeChecks: [check("email", true), check("length", true)],
        jobMatch: { matchScore: 90, summary: "", matchedKeywords: ["SQL"], missingKeywords: [] },
      }),
    ).toEqual([]);
  });

  it("puts a failed check with an unknown id last, titled by its label", () => {
    const items = buildFixFirstList({
      mainImprovements: ["Lead with results"],
      resumeChecks: [
        check("spelling", false, "3 typos found", "Spelling"),
        check("length", false),
        check("email", false),
      ],
    });
    expect(items.map((item) => item.id)).toEqual([
      "check-email",
      "ai-0",
      "check-length",
      "check-spelling",
    ]);
    expect(items.at(-1)).toEqual({
      id: "check-spelling",
      title: "Spelling",
      source: "check",
      detail: "Automated check: 3 typos found",
    });
  });

  it("has no job item without a job match or missing keywords", () => {
    for (const jobMatch of [undefined, null, {}, { matchScore: 70, missingKeywords: [] }, { missingKeywords: ["", "  "] }]) {
      const items = buildFixFirstList({ mainImprovements: ["Lead with results"], jobMatch });
      expect(items.map((item) => item.source)).toEqual(["ai"]);
    }
  });

  it("keeps duplicates: an AI improvement that repeats a check stays in the list", () => {
    const items = buildFixFirstList({
      mainImprovements: ["Add an email address"],
      resumeChecks: [check("email", false)],
    });
    expect(items.map((item) => item.title)).toEqual(["Add an email address", "Add an email address"]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "report"],
    ["an empty object", {}],
  ])("returns an empty list for %s", (_label, report) => {
    expect(buildFixFirstList(report)).toEqual([]);
  });

  it("never prints undefined, NaN or null for missing or malformed fields", () => {
    const items = buildFixFirstList({
      mainImprovements: ["  Trim the summary  ", "", "   ", null, 42, undefined],
      resumeChecks: [
        null,
        "email",
        { id: "email", passed: false },
        { id: "phone", passed: false, detail: "   " },
        { id: "sections", passed: false, detail: 7 },
        { passed: false, label: "No id", detail: "something" },
        { id: "mystery", passed: false },
        { id: "length" },
      ],
      jobMatch: { missingKeywords: [" Python ", null, 3, "SQL"] },
    });

    expect(items.map((item) => item.title)).toEqual([
      "Add an email address",
      "Add a phone number",
      "Use standard section headings",
      "Trim the summary",
      "Add keywords the job description asks for",
      "Adjust the length",
      "No id",
    ]);
    expect(items.find((item) => item.source === "job").detail).toBe("Job description: Python, SQL");
    for (const item of items) {
      expect(item.id).toBeTypeOf("string");
      expect(item.title).toBeTypeOf("string");
      expect(item.detail === null || typeof item.detail === "string").toBe(true);
      expect(`${item.id} ${item.title} ${item.detail ?? ""}`).not.toMatch(/undefined|NaN|null/);
    }
    // A check without a usable detail has no detail line.
    expect(items.filter((item) => item.source === "check").map((item) => item.detail)).toEqual([
      null,
      null,
      null,
      null,
      "Automated check: something",
    ]);
  });

  it("gives every item a unique id, even for repeated or colliding check ids", () => {
    const items = buildFixFirstList({
      mainImprovements: ["Lead with results"],
      resumeChecks: [
        check("email", false),
        check("email", false, "second email detail"),
        // Trimmed, this unknown id is the known "email" id.
        check(" email ", false, "padded id", "Padded id"),
        check("spelling", false, "3 typos", "Spelling"),
        check("spelling", false, "4 typos", "Spelling again"),
      ],
    });

    expect(items.map((item) => item.id)).toEqual([
      "check-email",
      "check-email-2",
      "ai-0",
      "check-email-3",
      "check-spelling",
      "check-spelling-2",
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    // Only the id changes: the item keeps its own title and detail.
    expect(items[1]).toEqual({
      id: "check-email-2",
      title: "Add an email address",
      source: "check",
      detail: "Automated check: second email detail",
    });
  });

  it("keeps ids unique when a check without an id gets the same id as a real one", () => {
    const items = buildFixFirstList({
      resumeChecks: [
        // No id: "check-other-<index among unknown checks>", here check-other-0.
        { passed: false, label: "No id", detail: "y" },
        { id: "other-0", passed: false, label: "Literal other", detail: "x" },
      ],
    });
    expect(items.map((item) => [item.id, item.title])).toEqual([
      ["check-other-0", "No id"],
      ["check-other-0-2", "Literal other"],
    ]);
  });

  it("keeps ids unique when a suffixed id is also a real id", () => {
    const items = buildFixFirstList({
      resumeChecks: [
        check("spelling", false, "a", "Spelling"),
        check("spelling", false, "b", "Spelling"),
        check("spelling-2", false, "c", "Spelling two"),
      ],
    });
    expect(items.map((item) => item.id)).toEqual([
      "check-spelling",
      "check-spelling-2",
      "check-spelling-2-2",
    ]);
  });

  it("collapses line breaks and whitespace runs in titles and details to single spaces", () => {
    const items = buildFixFirstList({
      mainImprovements: ["Lead each bullet\nwith the\t\tresult,\r\n  then the method  "],
      resumeChecks: [
        check("quantified-results", false, "2 measurable\nresults found.\n\nAim for at least 3."),
        check("spelling", false, "3 typos\tfound", "Spelling\nand grammar"),
      ],
      jobMatch: { missingKeywords: ["A/B\ntesting", "  Experiment   design "] },
    });

    expect(items.map((item) => [item.title, item.detail])).toEqual([
      ["Lead each bullet with the result, then the method", null],
      ["Add keywords the job description asks for", "Job description: A/B testing, Experiment design"],
      ["Add measurable results", "Automated check: 2 measurable results found. Aim for at least 3."],
      ["Spelling and grammar", "Automated check: 3 typos found"],
    ]);
    for (const item of items) {
      expect(`${item.title} ${item.detail ?? ""}`).not.toMatch(/[\n\r\t]| {2}/);
    }
  });

  it("does not modify the report", () => {
    const snapshot = structuredClone(FULL_REPORT);
    buildFixFirstList(FULL_REPORT);
    expect(FULL_REPORT).toEqual(snapshot);
  });
});

describe("FIX_FIRST_COUNT", () => {
  it("is the number of items shown as Fix first", () => {
    expect(FIX_FIRST_COUNT).toBe(3);
  });
});
