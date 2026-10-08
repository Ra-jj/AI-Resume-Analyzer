// The sample report shown from the home page: a fictional resume and a fixed
// AI reply, turned into a report by the same steps a real upload takes.
// Pure: no DOM, React, Puter or pdf.js. Imports lib/ modules only.

import { extractJson, normalizeAnalysis } from "./analysis.js";
import { collapseWhitespace } from "./limits.js";
import { buildReport } from "./report.js";
import { runResumeChecks } from "./resumeChecks.js";

/**
 * A fictional resume, as text. It passes the length, email, phone and
 * section checks and fails two: it has only two measurable results and no
 * profile link. The contact details are reserved for fiction: example.com
 * and a 555-01xx number.
 */
export const SAMPLE_RESUME_TEXT = `Rhea Castellano
Data Analyst
Columbus, OH | rhea.castellano@example.com | (614) 555-0142

Summary
Data analyst with eight years of experience turning operational data into reporting that teams rely on. I currently own analysis for the dispatch and network planning teams at a regional freight carrier. I enjoy building clean data models, writing careful SQL and explaining results to people who do not live in spreadsheets. I am looking for a role with more forecasting and product questions to work on.

Experience
Lumen Freight, Columbus, OH
Data Analyst, 2021 to present
- Built and maintain route-performance dashboards in Looker used by 40 dispatchers and planners every day.
- Wrote the dbt models behind on-time delivery, dwell time and lane cost reporting, replacing a set of manual spreadsheets.
- Partnered with network planning to find the lanes behind late deliveries; the routing changes that followed cut late deliveries by 12%.
- Run the weekly operations review, presenting trends and open questions to the regional directors.
- Added tests and documentation to the core SQL models so other analysts can extend them safely.
- Answer ad hoc questions from finance, sales and customer service, and turn repeat requests into self-serve reports.
- Defined shared metric definitions for on-time performance with the operations and finance leads.
- Worked with data engineering to move nightly loads onto a tested, documented schedule with alerts for stale tables.

Harbor & Pine Outfitters, Columbus, OH
Reporting Analyst, 2018 to 2021
- Produced weekly sales and inventory reports for store and regional managers.
- Moved recurring reports from Excel workbooks to scheduled SQL queries against the data warehouse.
- Cleaned and reconciled point-of-sale data with the inventory system at each month end.
- Built a seasonal sell-through report that the merchandising team used when planning orders.
- Trained new team members on the reporting tools and on how to read the store metrics.
- Documented data sources and report logic in a shared wiki for the wider analytics group.
- Answered questions from store leaders about markdowns, staffing and stock levels, with short written notes on the trends behind each answer.

Education
B.S. Statistics, Westbrook State University, 2018
Coursework in regression, probability, sampling, survey methods and data visualization. Senior project on survey weighting for a campus transit study.

Skills
SQL, dbt, Looker, Excel, Google Sheets, data modeling, dashboard design, stakeholder reporting, data quality testing, Git`;

/**
 * The AI reply for the sample resume, in the exact JSON shape the prompt
 * asks for (lib/prompt.js), including the jobMatch block a job description
 * adds.
 */
export const SAMPLE_AI_REPLY = {
  overallScore: 74,
  executiveSummary:
    "Rhea's resume shows a steady move from producing reports to owning analysis for an operations team, on a current SQL, dbt and Looker stack. Most bullets describe the work rather than what it changed, so the impact is easy to miss on a quick read.",
  topStrengths: [
    "Clear progression from reporting to owning analysis for a team",
    "SQL, dbt and Looker match current analytics roles",
    "Short, scannable bullets",
  ],
  mainImprovements: [
    "Lead each Lumen Freight bullet with the result, then the method",
    "Move Skills above Education so the tools are seen sooner",
    "Cut the summary to two sentences about the analysis you own",
  ],
  performanceMetrics: [
    { name: "Impact & Quantifiable Results", score: 58 },
    { name: "Brevity & Formatting", score: 81 },
    { name: "Action Verbs Usage", score: 70 },
    { name: "Grammar & Spelling", score: 92 },
  ],
  resumeInsights: [
    "The Lumen Freight role reads as ownership: the dashboards, the dbt models and the weekly review all sit with her.",
    "Only two bullets carry a number, so a recruiter scanning for impact has little to hold on to.",
    "The summary runs to four sentences in the first person, which pushes the experience section further down the page.",
  ],
  atsOptimization:
    "Standard headings and a single-column layout should parse cleanly in most ATS. The contact line is set inside a table, which some systems read out of order; plain text lines are safer.",
  atsCompatibilityChecklist: [
    { item: "Standard Section Headers", passed: true },
    { item: "No Complex Tables/Graphics", passed: false },
    { item: "Standard Font Usage", passed: true },
    { item: "Clear Contact Info", passed: true },
  ],
  recommendedKeywords: ["A/B testing", "Cohort analysis", "Experiment design", "Python", "Forecasting"],
  recommendedRoles: ["Senior Data Analyst", "Product Analyst", "Analytics Engineer"],
  jobMatch: {
    matchScore: 64,
    summary:
      "Strong on SQL, dashboards and stakeholder reporting; the role's experimentation and Python asks are not shown.",
    matchedKeywords: ["SQL", "dbt", "Looker", "Stakeholder reporting", "Data modeling"],
    missingKeywords: ["A/B testing", "Python", "Experiment design"],
  },
};

/**
 * Builds the sample report with the steps processFile in
 * hooks/useResumeAnalysis.js takes for an upload: whitespace collapsed as
 * after pdf.js extraction, the resume checks run on that full text, the AI
 * reply parsed and normalized as services/analyze.js does, then combined by
 * buildReport. Keep it in step with the hook, so the sample shows what a
 * real report would.
 */
export function buildSampleReport() {
  const resumeText = collapseWhitespace(SAMPLE_RESUME_TEXT);
  const resumeCheckResult = runResumeChecks(resumeText);
  const analysis = normalizeAnalysis(extractJson(JSON.stringify(SAMPLE_AI_REPLY)));
  return buildReport(analysis, resumeCheckResult);
}

let cachedSampleReport = null;

/** The sample report, built on first use and then reused. */
export function getSampleReport() {
  cachedSampleReport ??= buildSampleReport();
  return cachedSampleReport;
}
