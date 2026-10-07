import { MAX_ANALYZED_CHARACTERS } from "../src/lib/limits.js";
import { buildAnalysisMessages } from "../src/lib/prompt.js";
import { combineScores } from "../src/lib/report.js";
import {
  addJobDescriptionButton,
  analysisStatus,
  chooseFixture,
  dashboardHeading,
  expect,
  isPdfLibraryUrl,
  isPdfWorkerUrl,
  loadingHeading,
  test,
  uploadHeading,
} from "./helpers/test.js";
import {
  getPuterCalls,
  makeAnalysis,
  releaseHeldReply,
  replies,
  resumeTextOf,
  stubPuter,
} from "./helpers/puter.js";

// Text that pdf.js must extract from e2e/fixtures/resume.pdf.
const RESUME_PHRASES = [
  "Jordan Avery",
  "Senior Software Engineer, Northwind Logistics",
  "cutting p95 latency from 820 ms to 140 ms",
  "B.S. Computer Science",
];

// The score panel's modifier class for each rating, which sets its colour.
const RATING_CLASSES = {
  Excellent: /score-panel--excellent/,
  Good: /score-panel--good/,
  "Needs Improvement": /score-panel--needs-improvement/,
};

function expectedRating(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  return "Needs Improvement";
}

test("analyzes a resume end to end, then returns to a clean upload view", async ({ page }) => {
  const analysis = makeAnalysis({ overallScore: 90 });
  await stubPuter(page, [replies.heldAnalysis(analysis), replies.analysis(analysis)]);
  await page.goto("/");
  await expect(uploadHeading(page)).toBeVisible();

  await chooseFixture(page, "resume.pdf");

  // Loading: the progress steps replace the dropzone and the job
  // description. The status line names the current step.
  const loading = analysisStatus(page);
  await expect(loading).toHaveText("Analyzing with AI, step 2 of 3");
  await expect(uploadHeading(page)).toHaveCount(0);
  await expect(addJobDescriptionButton(page)).toHaveCount(0);

  await releaseHeldReply(page);
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(loadingHeading(page)).toHaveCount(0);
  // The status line belongs to the upload screen, which the report replaced.
  await expect(loading).toHaveCount(0);

  // Blended score: 70% AI review + 30% resume checks.
  const breakdown = page.locator(".score-breakdown-text");
  await expect(breakdown).toContainText("AI review 90");
  const checksMatch = (await breakdown.innerText()).match(/Resume checks (\d+)/);
  expect(checksMatch, "breakdown shows the resume checks score").not.toBeNull();
  const overallScore = combineScores(90, Number(checksMatch[1]));
  await expect(page.locator(".score-value")).toHaveText(String(overallScore));

  const rating = expectedRating(overallScore);
  await expect(page.locator(".score-badge")).toHaveText(rating);
  await expect(page.locator(".score-panel")).toHaveClass(RATING_CLASSES[rating]);

  // Resume Checks card, computed in the browser from the extracted text.
  const checksCard = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "Resume Checks" }),
  });
  const checkItems = checksCard.getByRole("listitem");
  const checkCount = await checkItems.count();
  expect(checkCount).toBeGreaterThan(0);
  await expect(checksCard.locator(".resume-checks-summary")).toHaveText(
    new RegExp(`^\\d+ of ${checkCount} checks passed$`),
  );

  // No job description was given, so there is no Job Match card.
  await expect(page.getByRole("heading", { name: "Job Match" })).toHaveCount(0);

  // The AI's own content is shown.
  await expect(page.getByText(analysis.executiveSummary)).toBeVisible();
  await expect(page.getByText(analysis.topStrengths[0])).toBeVisible();
  await expect(page.getByText(analysis.recommendedRoles[1])).toBeVisible();

  await page.getByRole("button", { name: "Analyze another resume" }).click();

  await expect(uploadHeading(page)).toBeVisible();
  await expect(dashboardHeading(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(addJobDescriptionButton(page)).toBeVisible();

  // The same file can be chosen again.
  await chooseFixture(page, "resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();
  expect(await getPuterCalls(page)).toHaveLength(2);
});

// resume.pdf passes every resume check (a checks score of 100), so the blend
// is 0.7 × AI + 30, and these AI scores land on each side of the 80 and 60
// rating cut-offs.
for (const { aiScore, overallScore, rating } of [
  { aiScore: 71, overallScore: 80, rating: "Excellent" },
  { aiScore: 70, overallScore: 79, rating: "Good" },
  { aiScore: 43, overallScore: 60, rating: "Good" },
  { aiScore: 42, overallScore: 59, rating: "Needs Improvement" },
]) {
  test(`rates a blended score of ${overallScore} as ${rating}`, async ({ page }) => {
    await stubPuter(page, [replies.analysis(makeAnalysis({ overallScore: aiScore }))]);
    await page.goto("/");
    await chooseFixture(page, "resume.pdf");

    await expect(page.locator(".score-breakdown-text")).toContainText("Resume checks 100");
    await expect(page.locator(".score-value")).toHaveText(String(overallScore));
    await expect(page.locator(".score-badge")).toHaveText(rating);
    await expect(page.locator(".score-panel")).toHaveClass(RATING_CLASSES[rating]);
  });
}

test("calls puter.ai.chat once with the pinned model and the resume inside <resume> tags", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await chooseFixture(page, "resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();

  const calls = await getPuterCalls(page);
  expect(calls).toHaveLength(1);
  const [messages, stream, options] = calls[0];
  expect(calls[0]).toHaveLength(3);
  expect(stream).toBe(false);
  expect(options).toEqual({ model: "claude-sonnet-5-5", normalize: true });
  expect(messages.map((message) => message.role)).toEqual(["system", "user"]);

  const resumeText = resumeTextOf(messages);
  for (const phrase of RESUME_PHRASES) expect(resumeText).toContain(phrase);
  // Exactly the prompt the app builds for this resume, with no job description.
  expect(messages).toEqual(buildAnalysisMessages(resumeText, null));
  expect(messages[1].content).not.toContain("<job_description>");
});

/**
 * Lets a minute pass on the page's clock (installed with page.clock.install())
 * with nobody touching the page, so a delayed fetch would have started.
 */
async function sitIdleForAMinute(page) {
  await page.clock.runFor(60_000);
  await page.waitForLoadState("networkidle");
}

test("downloads pdf.js only once a file is chosen, reads the PDF with it, then releases the worker", async ({ page }) => {
  await page.clock.install();
  await stubPuter(page, [replies.analysis()]);
  const pdfRequests = [];
  page.on("request", (request) => {
    if (isPdfLibraryUrl(request.url()) || isPdfWorkerUrl(request.url())) {
      pdfRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(uploadHeading(page)).toBeVisible();
  await sitIdleForAMinute(page);
  expect(pdfRequests).toEqual([]);

  // Only the minified worker matches isPdfWorkerUrl.
  const workerStarted = page.waitForEvent("worker", {
    predicate: (worker) => isPdfWorkerUrl(worker.url()),
    timeout: 10_000,
  });
  await chooseFixture(page, "resume.pdf");
  await workerStarted;
  await expect(dashboardHeading(page)).toBeVisible();

  expect(pdfRequests.some(isPdfLibraryUrl)).toBe(true);
  expect(pdfRequests.some(isPdfWorkerUrl)).toBe(true);

  // The upgraded pdf.js really extracted the fixture's text.
  const [[messages]] = await getPuterCalls(page);
  const resumeText = resumeTextOf(messages);
  for (const phrase of RESUME_PHRASES) expect(resumeText).toContain(phrase);

  // Destroying the loading task terminates the worker.
  await expect.poll(() => page.workers().length).toBe(0);
});

test("starts downloading pdf.js when the pointer reaches the upload button", async ({ page }) => {
  await page.clock.install();
  await stubPuter(page, [replies.analysis()]);
  let pdfLibraryRequested = false;
  page.on("request", (request) => {
    if (isPdfLibraryUrl(request.url())) pdfLibraryRequested = true;
  });
  await page.goto("/");
  await expect(uploadHeading(page)).toBeVisible();
  await sitIdleForAMinute(page);
  expect(pdfLibraryRequested).toBe(false);

  const pdfLibraryRequest = page.waitForRequest((request) => isPdfLibraryUrl(request.url()), {
    timeout: 5_000,
  });
  await page.getByText("Choose PDF File").hover();
  await pdfLibraryRequest;
  expect(await getPuterCalls(page)).toEqual([]);
});

test("sends only the first 15,000 characters of a long resume and says so", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await chooseFixture(page, "long-resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();

  await expect(page.locator(".truncation-notice")).toHaveText(
    `Only the first ${MAX_ANALYZED_CHARACTERS.toLocaleString("en-US")} characters of your resume were analyzed.`,
  );

  const [[messages]] = await getPuterCalls(page);
  const resumeText = resumeTextOf(messages);
  expect(resumeText).toHaveLength(MAX_ANALYZED_CHARACTERS);
  expect(resumeText.startsWith("Morgan Ellis")).toBe(true);
  // The fixture's last section lies past the cap.
  expect(resumeText).not.toContain("LONGRESUMETAILMARKER");
});

test("runs the resume checks on the full text of a long resume, not the AI's copy", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await chooseFixture(page, "long-resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();

  // Expected values for e2e/fixtures/long-resume.pdf: its full text is 2,566
  // words, over the length check's limit; the first 15,000 characters are not.
  const checksCard = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "Resume Checks" }),
  });
  await expect(checksCard.locator(".resume-checks-summary")).toHaveText("5 of 6 checks passed");
  // Each check is labelled for screen readers by its result.
  const checkItems = checksCard.getByRole("listitem");
  await expect(checkItems.filter({ hasText: /^Passed: / })).toHaveCount(5);
  await expect(
    checkItems.filter({ hasText: /^Needs attention: Resume length/ }),
  ).toContainText("2,566 words");
  await expect(page.locator(".score-breakdown-text")).toContainText("Resume checks 83");
});

test("accepts a PDF at the 10-page limit", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await chooseFixture(page, "ten-pages.pdf");
  await expect(dashboardHeading(page)).toBeVisible();
  const [[messages]] = await getPuterCalls(page);
  expect(resumeTextOf(messages)).toContain("Page 10");
});

test("does not show the truncation notice for a resume under the cap", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await chooseFixture(page, "resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page.locator(".truncation-notice")).toHaveCount(0);
});
