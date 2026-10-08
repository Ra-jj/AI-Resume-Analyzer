import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeAnalysis } from "./analysis.js";
import { buildFixFirstList } from "./fixFirst.js";
import {
  MAX_ANALYZED_CHARACTERS,
  MAX_JOB_DESCRIPTION_CHARACTERS,
  MIN_TEXT_CHARACTERS,
  collapseWhitespace,
  countNonWhitespaceCharacters,
  truncateForAnalysis,
} from "./limits.js";
import { buildAnalysisMessages } from "./prompt.js";
import { buildReport, getScoreRating } from "./report.js";
import { runResumeChecks } from "./resumeChecks.js";
import {
  SAMPLE_AI_REPLY,
  SAMPLE_RESUME_TEXT,
  buildSampleReport,
  getSampleReport,
} from "./sampleReport.js";

const report = getSampleReport();
const checksById = Object.fromEntries(report.resumeChecks.map((check) => [check.id, check]));

/** Every number anywhere inside `value`. */
function numbersIn(value) {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(numbersIn);
  return [];
}

describe("getSampleReport", () => {
  it("blends an AI score of 74 with a checks score of 67 into 72, rated Good", () => {
    expect(report.aiScore).toBe(74);
    expect(report.checksScore).toBe(67);
    expect(report.overallScore).toBe(72);
    expect(getScoreRating(report.overallScore)).toBe("Good");
  });

  it("fails exactly the measurable results and profile link checks", () => {
    expect(report.resumeChecks.filter((check) => !check.passed).map((check) => check.id)).toEqual([
      "quantified-results",
      "profile-link",
    ]);
    expect(checksById["quantified-results"].detail).toBe(
      "2 measurable results found. Aim for at least 3.",
    );
    expect(checksById.length.detail).toMatch(/^\d{3} words$/);
  });

  it("passes 3 of the 4 ATS checklist items", () => {
    expect(report.atsCompatibilityChecklist).toHaveLength(4);
    expect(report.atsCompatibilityChecklist.filter((item) => item.passed)).toHaveLength(3);
    expect(report.atsCompatibilityChecklist.find((item) => !item.passed).item).toBe(
      "No Complex Tables/Graphics",
    );
  });

  it("has a job match of 64 with 3 missing keywords", () => {
    expect(report.jobMatch.matchScore).toBe(64);
    expect(report.jobMatch.missingKeywords).toEqual(["A/B testing", "Python", "Experiment design"]);
    expect(report.jobMatch.matchedKeywords).toHaveLength(5);
  });

  it("fills every section of the report", () => {
    for (const key of [
      "executiveSummary",
      "topStrengths",
      "mainImprovements",
      "performanceMetrics",
      "resumeInsights",
      "atsOptimization",
      "atsCompatibilityChecklist",
      "recommendedKeywords",
      "recommendedRoles",
      "resumeChecks",
    ]) {
      expect(report[key], key).not.toHaveLength(0);
    }
    expect(report.jobMatch.summary).not.toBe("");
    expect(report.performanceMetrics.map((metric) => metric.score)).toEqual([58, 81, 70, 92]);
  });

  it("gives a 6-item fix list: the AI's improvements, the job keywords, then the failed checks", () => {
    const items = buildFixFirstList(getSampleReport());
    expect(items.map((item) => [item.source, item.title])).toEqual([
      ["ai", "Lead each Lumen Freight bullet with the result, then the method"],
      ["ai", "Move Skills above Education so the tools are seen sooner"],
      ["ai", "Cut the summary to two sentences about the analysis you own"],
      ["job", "Add keywords the job description asks for"],
      ["check", "Add measurable results"],
      ["check", "Add a LinkedIn or portfolio link"],
    ]);
    expect(items[3].detail).toBe("Job description: A/B testing, Python, Experiment design");
  });

  it("uses contact details reserved for fiction", () => {
    expect(checksById.email.detail).toBe("rhea.castellano@example.com");
    expect(checksById.phone.detail).toMatch(/^\(\d{3}\) 555-01\d{2}$/);
    expect(SAMPLE_RESUME_TEXT).not.toMatch(/linkedin|github|https?:|www\./i);
  });

  it("is built once and reused", () => {
    expect(getSampleReport()).toBe(report);
  });
});

describe("buildSampleReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the same steps as an upload: collapsed full text, checks, normalized reply, buildReport", () => {
    const resumeText = collapseWhitespace(SAMPLE_RESUME_TEXT);
    expect(buildSampleReport()).toEqual(
      buildReport(normalizeAnalysis(SAMPLE_AI_REPLY), runResumeChecks(resumeText)),
    );
  });

  it("has a resume an upload would accept, under the AI's character cap", () => {
    const resumeText = collapseWhitespace(SAMPLE_RESUME_TEXT);
    expect(countNonWhitespaceCharacters(resumeText)).toBeGreaterThanOrEqual(MIN_TEXT_CHARACTERS);
    // The app shows the sample with wasTextTruncated={false}.
    expect(truncateForAnalysis(resumeText).truncated).toBe(false);
  });

  it("has an AI reply in exactly the shape the prompt asks for", () => {
    // Normalizing changes nothing: every field is present, typed and in range.
    expect(normalizeAnalysis(SAMPLE_AI_REPLY)).toEqual(SAMPLE_AI_REPLY);
    const [, userMessage] = buildAnalysisMessages("resume", "job description");
    for (const key of Object.keys(SAMPLE_AI_REPLY)) {
      expect(userMessage.content).toContain(`"${key}"`);
    }
    for (const { name } of SAMPLE_AI_REPLY.performanceMetrics) {
      expect(userMessage.content).toContain(`"name": "${name}"`);
    }
    for (const { item } of SAMPLE_AI_REPLY.atsCompatibilityChecklist) {
      expect(userMessage.content).toContain(`"item": "${item}"`);
    }
    expect(Object.keys(SAMPLE_AI_REPLY.jobMatch)).toEqual([
      "matchScore",
      "summary",
      "matchedKeywords",
      "missingKeywords",
    ]);
  });

  // The error-boundary e2e tests make toLocaleString throw for 15,000 and
  // 5,000 to break one screen on purpose; the sample must not format either.
  it("never formats 15,000 or 5,000 with toLocaleString", () => {
    const formatted = [];
    const original = Number.prototype.toLocaleString;
    vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function toLocaleString(
      ...args
    ) {
      formatted.push(Number(this));
      return original.apply(this, args);
    });

    const freshReport = buildSampleReport();

    expect(formatted.length).toBeGreaterThan(0);
    for (const value of [...formatted, ...numbersIn(freshReport)]) {
      expect(value).not.toBe(MAX_ANALYZED_CHARACTERS);
      expect(value).not.toBe(MAX_JOB_DESCRIPTION_CHARACTERS);
    }
  });

  it("imports only pure lib modules", () => {
    const source = readFileSync(new URL("./sampleReport.js", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import\b[^;]*?\bfrom "([^"]+)";/gm)].map(
      (match) => match[1],
    );
    expect(imports.length).toBeGreaterThan(0);
    // Siblings in lib/ only: no services/, components or packages.
    for (const path of imports) expect(path).toMatch(/^\.\/\w+\.js$/);
    // No dynamic import (which could pull in pdf.js) and no use of Puter.
    expect(source).not.toMatch(/\bimport\s*\(|\bputer\./);
  });
});
