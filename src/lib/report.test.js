import { describe, expect, it } from "vitest";

import {
  AI_SCORE_WEIGHT_PERCENT,
  CHECKS_SCORE_WEIGHT_PERCENT,
  buildReport,
  combineScores,
  getScoreRating,
} from "./report.js";

/** round(0.7 × ai + 0.3 × checks) with exact half-up rounding, in integers only. */
function expectedBlend(aiScore, checksScore) {
  const weightedTotal = 70 * aiScore + 30 * checksScore;
  return Math.floor(weightedTotal / 100) + (weightedTotal % 100 >= 50 ? 1 : 0);
}

describe("combineScores", () => {
  it("weights the AI score 70% and the checks 30%", () => {
    expect(AI_SCORE_WEIGHT_PERCENT).toBe(70);
    expect(CHECKS_SCORE_WEIGHT_PERCENT).toBe(30);
  });

  it("matches exact half-up integer rounding for every pair of scores 0-100", () => {
    const mismatches = [];
    for (let aiScore = 0; aiScore <= 100; aiScore++) {
      for (let checksScore = 0; checksScore <= 100; checksScore++) {
        const actual = combineScores(aiScore, checksScore);
        const expected = expectedBlend(aiScore, checksScore);
        if (actual !== expected) mismatches.push(`${aiScore}/${checksScore}: ${actual} != ${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  // Pairs where floating-point 0.7 * a + 0.3 * c lands just below .5 and a
  // naive Math.round would round down.
  it.each([
    [2, 67, 22],
    [12, 17, 14],
    [45, 0, 32],
    [48, 33, 44],
    [85, 0, 60],
    [92, 67, 85],
  ])("rounds %i/%i up to %i", (aiScore, checksScore, expected) => {
    expect(combineScores(aiScore, checksScore)).toBe(expected);
  });

  it.each([
    [85, 67, 80],
    [75, 50, 68],
    [100, 100, 100],
    [0, 0, 0],
    [0, 100, 30],
    [100, 0, 70],
    [77, 83, 79],
    [41, 17, 34],
  ])("%i and %i -> %i", (aiScore, checksScore, expected) => {
    expect(combineScores(aiScore, checksScore)).toBe(expected);
  });

  it("clamps each input to 0-100 before blending", () => {
    expect(combineScores(150, -20)).toBe(70);
    expect(combineScores(-5, 50)).toBe(15);
    expect(combineScores(150, 50)).toBe(85);
    expect(combineScores(50, 1000)).toBe(65);
  });

  it("accepts a non-integer score and still returns an integer", () => {
    expect(combineScores(79.5, 50)).toBe(71);
  });

  it.each([
    ["NaN", Number.NaN, 50],
    ["Infinity", Number.POSITIVE_INFINITY, 50],
    ["a numeric string", "80", 50],
    ["null", null, 50],
    ["undefined checks score", 50, undefined],
    ["-Infinity checks score", 50, Number.NEGATIVE_INFINITY],
  ])("throws TypeError for %s", (_label, aiScore, checksScore) => {
    expect(() => combineScores(aiScore, checksScore)).toThrow(TypeError);
  });
});

describe("buildReport", () => {
  const analysis = {
    overallScore: 85,
    executiveSummary: "Strong.",
    topStrengths: ["a"],
    mainImprovements: [],
    performanceMetrics: [{ name: "Impact", score: 12 }],
    resumeInsights: [],
    atsOptimization: "",
    atsCompatibilityChecklist: [],
    recommendedKeywords: [],
    recommendedRoles: [],
    jobMatch: { matchScore: 64, summary: "s", matchedKeywords: ["Go"], missingKeywords: [] },
  };
  const checks = [{ id: "length", label: "Resume length", passed: true, detail: "359 words" }];

  it("blends overallScore, keeps the AI score as aiScore and adds the checks", () => {
    const report = buildReport(analysis, { score: 67, checks });
    expect(report.overallScore).toBe(80);
    expect(report.aiScore).toBe(85);
    expect(report.checksScore).toBe(67);
    expect(report.resumeChecks).toBe(checks);
  });

  it("passes every other analysis field through unchanged", () => {
    const report = buildReport(analysis, { score: 67, checks });
    expect(report).toEqual({
      ...analysis,
      overallScore: 80,
      aiScore: 85,
      checksScore: 67,
      resumeChecks: checks,
    });
    expect(report.jobMatch).toBe(analysis.jobMatch);
  });

  it("does not modify the analysis it was given", () => {
    const snapshot = structuredClone(analysis);
    buildReport(analysis, { score: 0, checks: [] });
    expect(analysis).toEqual(snapshot);
  });
});

describe("getScoreRating", () => {
  it.each([
    [100, "Excellent"],
    [80, "Excellent"],
    [79, "Good"],
    [60, "Good"],
    [59, "Needs Improvement"],
    [0, "Needs Improvement"],
  ])("rates %i as %s", (score, rating) => {
    expect(getScoreRating(score)).toBe(rating);
  });
});
