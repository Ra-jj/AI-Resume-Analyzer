import { describe, expect, it } from "vitest";

import { buildReportSummaryText } from "./reportText.js";

// A report in the shape buildReport() returns.
function makeReport(overrides = {}) {
  return {
    overallScore: 80,
    aiScore: 85,
    checksScore: 67,
    executiveSummary: "A focused backend engineer with measurable impact.",
    topStrengths: ["Quantified results"],
    mainImprovements: ["Shorten the summary", "Group skills by proficiency"],
    performanceMetrics: [{ name: "Impact", score: 88 }],
    resumeInsights: ["Leadership is shown through mentoring"],
    atsOptimization: "Parses cleanly.",
    atsCompatibilityChecklist: [{ item: "Standard Section Headers", passed: true }],
    recommendedKeywords: ["Distributed Systems", "gRPC"],
    recommendedRoles: ["Staff Engineer"],
    jobMatch: {
      matchScore: 74,
      summary: "Strong backend fit.",
      matchedKeywords: ["Go"],
      missingKeywords: ["Rust", "Incident Commander"],
    },
    resumeChecks: [
      { id: "length", label: "Resume length", passed: true, detail: "520 words" },
      {
        id: "phone",
        label: "Phone number",
        passed: false,
        detail: "No phone number found",
      },
      {
        id: "link",
        label: "LinkedIn or portfolio link",
        passed: false,
        detail: "No profile link found",
      },
    ],
    ...overrides,
  };
}

const FULL_REPORT_TEXT = `AI Resume Analyzer report

Scores
Overall score: 80/100 (Excellent)
AI review: 85/100
Resume checks: 67/100 (1 of 3 passed)

Executive summary
A focused backend engineer with measurable impact.

Main improvements
- Shorten the summary
- Group skills by proficiency

Resume checks that need attention
- Phone number: No phone number found
- LinkedIn or portfolio link: No profile link found

Job match
Match with this role: 74%
Missing keywords: Rust, Incident Commander

Recommended keywords: Distributed Systems, gRPC`;

function expectNoMissingValues(text) {
  expect(text).not.toMatch(/undefined|NaN|null|\[object Object\]/);
}

describe("buildReportSummaryText", () => {
  it("formats a full report with a job match", () => {
    expect(buildReportSummaryText(makeReport())).toBe(FULL_REPORT_TEXT);
  });

  it("leaves out the job match block when there is no job match", () => {
    const text = buildReportSummaryText(makeReport({ jobMatch: null }));
    expect(text).not.toContain("Job match");
    expect(text).not.toContain("Missing keywords");
    expect(text).toBe(
      FULL_REPORT_TEXT.replace(
        "\n\nJob match\nMatch with this role: 74%\nMissing keywords: Rust, Incident Commander",
        "",
      ),
    );
  });

  it("shows the match score without a missing keywords line when none are missing", () => {
    const text = buildReportSummaryText(
      makeReport({
        jobMatch: { matchScore: 91, summary: "", matchedKeywords: ["Go"], missingKeywords: [] },
      }),
    );
    expect(text).toContain("Job match\nMatch with this role: 91%\n\nRecommended keywords:");
    expect(text).not.toContain("Missing keywords");
  });

  it("leaves out a job match without a usable score", () => {
    for (const jobMatch of [
      { matchScore: Number.NaN, missingKeywords: ["Rust"] },
      { matchScore: "74", missingKeywords: ["Rust"] },
      { missingKeywords: ["Rust"] },
      undefined,
    ]) {
      const text = buildReportSummaryText(makeReport({ jobMatch }));
      expect(text).not.toContain("Job match");
      expect(text).not.toContain("Rust");
      expectNoMissingValues(text);
    }
  });

  it("formats a sparse report with only an overall score", () => {
    expect(buildReportSummaryText({ overallScore: 42 })).toBe(
      "AI Resume Analyzer report\n\nScores\nOverall score: 42/100 (Needs Improvement)",
    );
  });

  it("leaves out every empty section", () => {
    const text = buildReportSummaryText(
      makeReport({
        executiveSummary: "   ",
        mainImprovements: [],
        recommendedKeywords: [],
        jobMatch: null,
        resumeChecks: [],
      }),
    );
    expect(text).toBe(
      "AI Resume Analyzer report\n\nScores\nOverall score: 80/100 (Excellent)\nAI review: 85/100\nResume checks: 67/100",
    );
  });

  it("leaves out the attention block when every resume check passed", () => {
    const text = buildReportSummaryText(
      makeReport({
        checksScore: 100,
        resumeChecks: [
          { id: "length", label: "Resume length", passed: true, detail: "520 words" },
          { id: "email", label: "Email address", passed: true, detail: "a@example.com" },
        ],
      }),
    );
    expect(text).toContain("Resume checks: 100/100 (2 of 2 passed)");
    expect(text).not.toContain("need attention");
  });

  it("never prints undefined, NaN or null for missing or malformed fields", () => {
    const text = buildReportSummaryText({
      overallScore: Number.NaN,
      aiScore: undefined,
      checksScore: null,
      executiveSummary: 42,
      mainImprovements: ["Real item", null, 7, { text: "object" }, "", "  "],
      resumeChecks: [
        { label: "Phone number", passed: false },
        { label: "Email address", passed: false, detail: null },
        { passed: false, detail: "no label" },
        null,
      ],
      recommendedKeywords: "gRPC",
      jobMatch: { matchScore: Number.POSITIVE_INFINITY },
    });
    expectNoMissingValues(text);
    expect(text).toBe(
      [
        "AI Resume Analyzer report",
        "Main improvements\n- Real item",
        "Resume checks that need attention\n- Phone number\n- Email address",
      ].join("\n\n"),
    );
  });

  it("puts each list item and keyword on one line", () => {
    const text = buildReportSummaryText(
      makeReport({
        mainImprovements: ["Shorten the\nsummary   to two  sentences"],
        recommendedKeywords: ["Event\nSourcing", " gRPC "],
        jobMatch: null,
        resumeChecks: [],
      }),
    );
    expect(text).toContain("- Shorten the summary to two sentences");
    expect(text).toContain("Recommended keywords: Event Sourcing, gRPC");
  });

  it.each([
    [0, "Needs Improvement"],
    [59, "Needs Improvement"],
    [60, "Good"],
    [79, "Good"],
    [80, "Excellent"],
    [100, "Excellent"],
  ])("rates an overall score of %i as %s", (overallScore, rating) => {
    expect(buildReportSummaryText({ overallScore })).toContain(
      `Overall score: ${overallScore}/100 (${rating})`,
    );
  });

  it("does not modify the report and returns the same text each time", () => {
    const report = makeReport();
    const snapshot = structuredClone(report);
    const first = buildReportSummaryText(report);
    expect(buildReportSummaryText(report)).toBe(first);
    expect(report).toEqual(snapshot);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "report"],
  ])("throws TypeError for %s", (_label, value) => {
    expect(() => buildReportSummaryText(value)).toThrow(TypeError);
  });
});
