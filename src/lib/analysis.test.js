import { describe, expect, it } from "vitest";

import { extractJson, getResponseText, normalizeAnalysis } from "./analysis.js";

const VALID_REPLY = {
  overallScore: 78,
  executiveSummary: "  Solid resume.  ",
  topStrengths: ["A", "B"],
  mainImprovements: ["C"],
  performanceMetrics: [{ name: "Impact", score: 70 }],
  resumeInsights: ["I"],
  atsOptimization: "Parses well.",
  atsCompatibilityChecklist: [{ item: "Headers", passed: true }],
  recommendedKeywords: ["k"],
  recommendedRoles: ["r"],
};
const VALID_JSON = JSON.stringify(VALID_REPLY);

const NORMALIZED_KEYS = [
  "overallScore",
  "executiveSummary",
  "topStrengths",
  "mainImprovements",
  "performanceMetrics",
  "resumeInsights",
  "atsOptimization",
  "atsCompatibilityChecklist",
  "recommendedKeywords",
  "recommendedRoles",
  "jobMatch",
];

/**
 * A readable test-name label for any value. JSON alone would print NaN and
 * Infinity as null and -0 as 0, which hides which case failed.
 */
function labelOf(value) {
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

/** [label, value] rows, so it.each never spreads an array value into arguments. */
const labelled = (values) => values.map((value) => [labelOf(value), value]);

const scoreOf = (overallScore) =>
  normalizeAnalysis({ ...VALID_REPLY, overallScore }).overallScore;

/** Fails on any undefined, NaN or out-of-range number anywhere in `value`. */
function expectNoUndefinedOrNaN(value, path = "result") {
  expect(value, `${path} is undefined`).not.toBeUndefined();
  if (typeof value === "number") {
    expect(Number.isInteger(value), `${path} = ${value}`).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      expectNoUndefinedOrNaN(child, `${path}.${key}`);
    }
  }
}

describe("extractJson", () => {
  it("reads a ```json fenced block surrounded by prose", () => {
    expect(extractJson(`Here you go:\n\`\`\`json\n${VALID_JSON}\n\`\`\`\nThanks!`)).toEqual(VALID_REPLY);
  });

  it("reads a fence without a language and an uppercase ```JSON fence", () => {
    expect(extractJson(`\`\`\`\n${VALID_JSON}\n\`\`\``)).toEqual(VALID_REPLY);
    expect(extractJson(`\`\`\`JSON\n${VALID_JSON}\n\`\`\``)).toEqual(VALID_REPLY);
  });

  it("prefers an unlabelled fence over braces in the prose before it", () => {
    expect(extractJson('Use {curly} braces.\n```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("uses the first fence when there are two", () => {
    expect(extractJson('```json\n{"a":9}\n```\n```json\n{"a":10}\n```')).toEqual({ a: 9 });
  });

  it("falls back to the text after an empty fence", () => {
    expect(extractJson('```json\n```\n{"a":8}')).toEqual({ a: 8 });
  });

  it("reads JSON wrapped in prose without a fence", () => {
    expect(extractJson(`Sure! Here is the analysis: ${VALID_JSON} Let me know.`)).toEqual(VALID_REPLY);
  });

  it("reads bare JSON with surrounding whitespace and a byte-order mark", () => {
    expect(extractJson(`\n\n  ${VALID_JSON}  \n`)).toEqual(VALID_REPLY);
    expect(extractJson('\uFEFF{"a":11}')).toEqual({ a: 11 });
  });

  it("returns the object inside a top-level array (first { to last })", () => {
    expect(extractJson('[{"overallScore":1}]')).toEqual({ overallScore: 1 });
  });

  it.each([
    ["no JSON at all", "I can't help with that."],
    ["truncated JSON", VALID_JSON.slice(0, 40)],
    ["an empty string", ""],
    ["a stray brace in the prose before the JSON", 'Use {curly} braces. {"a":6}'],
    ["a stray brace after the JSON", '{"a":7} -- end }'],
    ["a trailing comma", '{"a":13,}'],
    ["a comment", '{"a":12 // c\n}'],
  ])("throws SyntaxError for %s", (_label, text) => {
    expect(() => extractJson(text)).toThrow(SyntaxError);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 5],
    ["an object", {}],
  ])("throws TypeError for non-string input (%s)", (_label, value) => {
    expect(() => extractJson(value)).toThrow(TypeError);
  });
});

describe("getResponseText", () => {
  it("returns a string response as-is", () => {
    expect(getResponseText("abc")).toBe("abc");
    expect(getResponseText("")).toBe("");
  });

  it("returns message.content when it is a non-blank string", () => {
    expect(getResponseText({ message: { content: "x" } })).toBe("x");
  });

  it("joins a content array of text parts and bare strings, skipping other parts", () => {
    const response = {
      message: {
        content: [{ type: "text", text: '{"a":' }, "1", { type: "image" }, { type: "text", text: "}" }],
      },
    };
    expect(getResponseText(response)).toBe('{"a":1}');
  });

  it("falls back to .text when content is empty, blank, or an array with no text", () => {
    expect(getResponseText({ message: { content: "" }, text: "t" })).toBe("t");
    expect(getResponseText({ message: { content: "   " }, text: "t" })).toBe("t");
    expect(getResponseText({ message: { content: [{ type: "image" }] }, text: "t" })).toBe("t");
    expect(getResponseText({ text: "t" })).toBe("t");
  });

  it("serialises anything else to JSON as a last resort", () => {
    expect(getResponseText({ foo: 1 })).toBe('{"foo":1}');
    expect(getResponseText({ message: { content: [{ type: "tool_use", input: {} }] } })).toBe(
      '{"message":{"content":[{"type":"tool_use","input":{}}]}}',
    );
    expect(getResponseText(5)).toBe("5");
    expect(getResponseText(null)).toBe("null");
    expect(getResponseText(undefined)).toBe("");
  });

  it("throws TypeError for replies JSON.stringify cannot serialise (circular, BigInt)", () => {
    const circular = { message: {} };
    circular.message.content = circular;
    expect(() => getResponseText(circular)).toThrow(TypeError);
    expect(() => getResponseText({ message: { content: "" }, usage: 10n })).toThrow(TypeError);
  });
});

// [input, expected score]
const SCORE_CASES = [
  ["85", 85],
  ["85%", 85],
  ["85 %", 85],
  ["85.5%", 86],
  ["85/100", 85],
  ["8.5 / 10", 85],
  ["4/5", 80],
  [" 72 ", 72],
  ["+90", 90],
  ["0", 0],
  ["-0", 0],
  ["150", 100],
  ["-5", 0],
  ["100.4", 100],
  ["100.5", 100],
  ["99.5", 100],
  ["0.0001", 0],
  ["12345678901234567890", 100],
  [150, 100],
  [-5, 0],
  [84.6, 85],
  [49.5, 50],
  [0.4, 0],
  [-0.4, 0],
  [-0, 0],
  [1e2, 100],
  [1e300, 100],
  [-1e300, 0],
];

describe("normalizeAnalysis: overallScore parsing", () => {
  it.each(SCORE_CASES.map(([input, expected]) => [labelOf(input), input, expected]))(
    "%s -> %i",
    (_label, input, expected) => {
      expect(scoreOf(input)).toBe(expected);
    },
  );

  it.each(labelled([
    null,
    undefined,
    "",
    "  ",
    "abc",
    "85 points",
    "85 out of 100",
    "85/100%",
    "85%%",
    "85.",
    ".5",
    "1e2",
    "0x50",
    "NaN",
    "Infinity",
    "10/0",
    "85/0",
    "0/0",
    "\u096E\u096B", // Devanagari digits
    "\u0668\u0665", // Arabic-Indic digits
    "\uFF18\uFF15", // full-width digits
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    false,
    [85],
    { value: 85 },
  ]))("rejects unusable overallScore %s with a TypeError naming the field", (_label, input) => {
    expect(() => normalizeAnalysis({ ...VALID_REPLY, overallScore: input })).toThrow(/overallScore/);
    expect(() => normalizeAnalysis({ ...VALID_REPLY, overallScore: input })).toThrow(TypeError);
  });

  it("throws when overallScore is missing", () => {
    const withoutScore = { ...VALID_REPLY };
    delete withoutScore.overallScore;
    expect(() => normalizeAnalysis(withoutScore)).toThrow(/overallScore/);
  });
});

describe("normalizeAnalysis: input type", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", VALID_JSON],
    ["a boolean", true],
    ["an empty array", []],
    ["an array holding a valid reply", [VALID_REPLY]],
    ["a Date", new Date()],
  ])("throws TypeError for %s", (_label, raw) => {
    expect(() => normalizeAnalysis(raw)).toThrow(TypeError);
  });

  it("accepts a null-prototype object", () => {
    const raw = Object.assign(Object.create(null), VALID_REPLY);
    expect(normalizeAnalysis(raw).overallScore).toBe(78);
  });

  it("does not read a score hidden under a JSON __proto__ key, and does not pollute Object.prototype", () => {
    const polluted = extractJson(
      '{"__proto__":{"overallScore":99,"polluted":true},"overallScore":70,"performanceMetrics":[{"__proto__":{"name":"p","score":1}},{"name":"ok","score":"60"}]}',
    );
    const result = normalizeAnalysis(polluted);
    expect(result.overallScore).toBe(70);
    expect(result.performanceMetrics).toEqual([{ name: "ok", score: 60 }]);
    expect({}.polluted).toBeUndefined();
    expect(() => normalizeAnalysis(extractJson('{"__proto__":{"overallScore":99}}'))).toThrow(/overallScore/);
  });
});

describe("normalizeAnalysis: fields", () => {
  it("keeps every field of a full reply, trims strings and adds jobMatch: null", () => {
    const result = normalizeAnalysis(VALID_REPLY);
    expect(Object.keys(result).sort()).toEqual([...NORMALIZED_KEYS].sort());
    expect(result).toEqual({
      ...VALID_REPLY,
      executiveSummary: "Solid resume.",
      jobMatch: null,
    });
  });

  it("defaults every other field when only overallScore is present", () => {
    expect(normalizeAnalysis({ overallScore: "60" })).toEqual({
      overallScore: 60,
      executiveSummary: "",
      topStrengths: [],
      mainImprovements: [],
      performanceMetrics: [],
      resumeInsights: [],
      atsOptimization: "",
      atsCompatibilityChecklist: [],
      recommendedKeywords: [],
      recommendedRoles: [],
      jobMatch: null,
    });
  });

  it("drops keys the dashboard doesn't read", () => {
    const result = normalizeAnalysis({ ...VALID_REPLY, injected: "<img src=x onerror=alert(1)>" });
    expect(result).not.toHaveProperty("injected");
  });

  it("turns non-string text fields into ''", () => {
    const result = normalizeAnalysis({
      ...VALID_REPLY,
      executiveSummary: 42,
      atsOptimization: { text: "x" },
    });
    expect(result.executiveSummary).toBe("");
    expect(result.atsOptimization).toBe("");
  });

  it("keeps only non-blank strings in string lists, trimmed", () => {
    const result = normalizeAnalysis({
      ...VALID_REPLY,
      topStrengths: ["  Leadership ", "", "   ", 7, null, undefined, { a: 1 }, ["x"], true, "Clear writing"],
    });
    expect(result.topStrengths).toEqual(["Leadership", "Clear writing"]);
  });

  it("caps string lists at 10 items, counted after empty items are dropped", () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `kw${index + 1}`);
    expect(normalizeAnalysis({ ...VALID_REPLY, recommendedKeywords: twelve }).recommendedKeywords).toEqual(
      twelve.slice(0, 10),
    );
    const padded = [...Array(15).fill(""), ...Array.from({ length: 12 }, (_, index) => `s${index}`)];
    const result = normalizeAnalysis({ ...VALID_REPLY, topStrengths: padded });
    expect(result.topStrengths).toHaveLength(10);
    expect(result.topStrengths[0]).toBe("s0");
  });

  it("turns non-array list fields into []", () => {
    const result = normalizeAnalysis({
      ...VALID_REPLY,
      recommendedRoles: "Engineer",
      mainImprovements: null,
      resumeInsights: { 0: "x" },
    });
    expect(result.recommendedRoles).toEqual([]);
    expect(result.mainImprovements).toEqual([]);
    expect(result.resumeInsights).toEqual([]);
  });

  it("keeps valid performance metrics, parsing and clamping scores, and drops the rest", () => {
    const result = normalizeAnalysis({
      ...VALID_REPLY,
      performanceMetrics: [
        { name: " Impact ", score: "88%" },
        { name: "Brevity", score: 130 },
        { name: "Verbs", score: "-3" },
        { name: "Grammar", score: "85/100" },
        { name: "", score: 50 },
        { name: 5, score: 50 },
        { name: "No score" },
        { name: "Bad score", score: "high" },
        { name: "N/A score", score: "N/A" },
        { name: "Boolean score", score: true },
        null,
        "Grammar: 90",
      ],
    });
    expect(result.performanceMetrics).toEqual([
      { name: "Impact", score: 88 },
      { name: "Brevity", score: 100 },
      { name: "Verbs", score: 0 },
      { name: "Grammar", score: 85 },
    ]);
  });

  it("caps metrics and checklist items at 10, counting only valid entries", () => {
    const result = normalizeAnalysis({
      ...VALID_REPLY,
      performanceMetrics: Array.from({ length: 14 }, (_, index) => ({ name: `m${index}`, score: index })),
      atsCompatibilityChecklist: Array.from({ length: 14 }, (_, index) => ({ item: `c${index}`, passed: true })),
    });
    expect(result.performanceMetrics).toHaveLength(10);
    expect(result.atsCompatibilityChecklist).toHaveLength(10);

    const invalidThenValid = normalizeAnalysis({
      ...VALID_REPLY,
      performanceMetrics: [...Array(20).fill({ name: "x", score: "N/A" }), { name: "real", score: 5 }],
    });
    expect(invalidThenValid.performanceMetrics).toEqual([{ name: "real", score: 5 }]);
  });

  it.each(labelled([true, 1, "1", "true", "TRUE", "yes", "Yes", " YES ", "y", " Y ", "pass", "PASS ", "passed", "Passed"]))(
    "checklist passed %s -> true",
    (_label, passed) => {
      const result = normalizeAnalysis({ ...VALID_REPLY, atsCompatibilityChecklist: [{ item: "x", passed }] });
      expect(result.atsCompatibilityChecklist).toEqual([{ item: "x", passed: true }]);
    },
  );

  it.each(labelled([false, 0, 2, "0", "false", "no", "n", "fail", "failed", "", "yes please", "\u2713", null, undefined, {}, []]))(
    "checklist passed %s -> false",
    (_label, passed) => {
      const result = normalizeAnalysis({ ...VALID_REPLY, atsCompatibilityChecklist: [{ item: "x", passed }] });
      expect(result.atsCompatibilityChecklist).toEqual([{ item: "x", passed: false }]);
    },
  );

  it("drops checklist entries without a usable item name and trims the rest", () => {
    const result = normalizeAnalysis({
      ...VALID_REPLY,
      atsCompatibilityChecklist: [
        { item: " Fonts ", passed: "true" },
        { item: "", passed: true },
        { item: 3, passed: true },
        { passed: true },
        "I",
        null,
      ],
    });
    expect(result.atsCompatibilityChecklist).toEqual([{ item: "Fonts", passed: true }]);
  });

  it("never produces undefined, NaN or an out-of-range number", () => {
    const outputs = [
      normalizeAnalysis(VALID_REPLY),
      normalizeAnalysis({ overallScore: "0%" }),
      normalizeAnalysis({ overallScore: 100, performanceMetrics: [{ name: "x", score: "7/10" }] }),
      normalizeAnalysis({
        overallScore: "8.5 / 10",
        jobMatch: { matchScore: "61.6", matchedKeywords: [undefined, "Go"], missingKeywords: undefined },
      }),
    ];
    outputs.forEach((output, index) => expectNoUndefinedOrNaN(output, `output${index}`));
  });

  it("reads a fenced reply with string scores end to end", () => {
    const reply =
      'Here is the JSON:\n```json\n{"overallScore":"91%","performanceMetrics":[{"name":"Impact","score":"85/100"}],"atsCompatibilityChecklist":[{"item":"Fonts","passed":"false"}]}\n```';
    const result = normalizeAnalysis(extractJson(reply));
    expect(result.overallScore).toBe(91);
    expect(result.performanceMetrics).toEqual([{ name: "Impact", score: 85 }]);
    expect(result.atsCompatibilityChecklist).toEqual([{ item: "Fonts", passed: false }]);
  });

  it("rejects error-shaped replies that have no overallScore", () => {
    for (const reply of [
      { error: "rate limited" },
      { success: false, error: { message: "Insufficient funds", code: "insufficient_funds" } },
    ]) {
      expect(() => normalizeAnalysis(extractJson(getResponseText(reply)))).toThrow(/overallScore/);
    }
  });
});

describe("normalizeAnalysis: jobMatch", () => {
  const base = { overallScore: 70 };

  it("is null when the reply has none", () => {
    expect(normalizeAnalysis(base).jobMatch).toBeNull();
  });

  it("parses the score, trims the summary, cleans and caps the keyword lists", () => {
    const result = normalizeAnalysis({
      ...base,
      jobMatch: {
        matchScore: "72%",
        summary: "  Good fit.  ",
        matchedKeywords: ["Go", " ", 3, "Kafka"],
        missingKeywords: Array.from({ length: 14 }, (_, index) => `k${index}`),
      },
    });
    expect(result.jobMatch).toEqual({
      matchScore: 72,
      summary: "Good fit.",
      matchedKeywords: ["Go", "Kafka"],
      missingKeywords: Array.from({ length: 10 }, (_, index) => `k${index}`),
    });
  });

  it.each([
    ["8.5/10", 85],
    [140, 100],
    [-5, 0],
    ["61.6", 62],
  ].map(([input, expected]) => [labelOf(input), input, expected]))(
    "matchScore %s -> %i (same parsing and clamping as overallScore)",
    (_label, matchScore, expected) => {
      expect(normalizeAnalysis({ ...base, jobMatch: { matchScore } }).jobMatch.matchScore).toBe(expected);
    },
  );

  it("fills an empty summary and lists when only the score is present", () => {
    expect(normalizeAnalysis({ ...base, jobMatch: { matchScore: 50 } }).jobMatch).toEqual({
      matchScore: 50,
      summary: "",
      matchedKeywords: [],
      missingKeywords: [],
    });
  });

  it.each([
    ["null", null],
    ["a string", "72"],
    ["a number", 72],
    ["an array", [{ matchScore: 50 }]],
    ["an unusable score", { matchScore: "high" }],
    ["no score", { summary: "no score" }],
    ["a null score", { matchScore: null }],
  ])("is null for %s, and the report is still valid", (_label, jobMatch) => {
    const result = normalizeAnalysis({ ...base, jobMatch });
    expect(result.jobMatch).toBeNull();
    expect(result.overallScore).toBe(70);
  });

  it("does not rescue a reply that has no overallScore", () => {
    expect(() => normalizeAnalysis({ jobMatch: { matchScore: 80 } })).toThrow(/overallScore/);
  });
});
