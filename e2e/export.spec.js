import { normalizeAnalysis } from "../src/lib/analysis.js";
import { buildReport } from "../src/lib/report.js";
import { buildReportSummaryText } from "../src/lib/reportText.js";
import { runResumeChecks } from "../src/lib/resumeChecks.js";
import {
  addJobDescriptionButton,
  chooseFixture,
  dashboardHeading,
  expect,
  jobDescriptionField,
  test,
} from "./helpers/test.js";
import {
  getPuterCalls,
  makeAnalysis,
  makeJobMatch,
  replies,
  resumeTextOf,
  stubPuter,
} from "./helpers/puter.js";

const JOB_DESCRIPTION =
  "Senior Backend Engineer, Payments Platform. We are looking for an engineer with 5+ years of Go or Rust, Kubernetes and PostgreSQL.";
const COPY_FAILED_MESSAGE =
  "Couldn't copy the summary. Select the report text and copy it manually.";

const copyButton = (page) => page.getByRole("button", { name: "Copy summary" });
const printButton = (page) => page.getByRole("button", { name: "Print or save as PDF" });
const copyFeedback = (page) => page.locator(".report-action-feedback");

/** Analyzes `fixture` with a job description, against `analysis`. */
async function openReport(page, analysis, fixture = "resume.pdf") {
  await stubPuter(page, [replies.analysis(analysis)]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();
  await jobDescriptionField(page).fill(JOB_DESCRIPTION);
  await chooseFixture(page, fixture);
  await expect(dashboardHeading(page)).toBeVisible();
}

test.describe("Copy summary", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  });

  test("puts the report summary on the clipboard and confirms it", async ({ page }) => {
    await page.clock.install();
    const analysis = makeAnalysis({ jobMatch: makeJobMatch() });
    await openReport(page, analysis);
    await expect(copyFeedback(page)).toHaveAttribute("aria-live", "polite");
    await expect(copyFeedback(page)).toHaveText("");

    await copyButton(page).click();

    await expect(copyFeedback(page)).toHaveText("Summary copied");
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    // The same report the page built: resume.pdf is under the length cap, so
    // the text the AI received is the full text the checks ran on.
    const [[messages]] = await getPuterCalls(page);
    const expectedReport = buildReport(
      normalizeAnalysis(analysis),
      runResumeChecks(resumeTextOf(messages)),
    );
    expect(clipboardText).toBe(buildReportSummaryText(expectedReport));
    expect(clipboardText).toContain(
      "Main improvements\n- Shorten the summary to two sentences\n- Group skills by proficiency",
    );
    expect(clipboardText).toContain(
      "Job match\nMatch with this role: 74%\nMissing keywords: Rust, Incident Commander",
    );

    // The confirmation clears itself.
    await page.clock.fastForward(4_000);
    await expect(copyFeedback(page)).toHaveText("");
  });

  test("includes the resume checks that need attention", async ({ page }) => {
    await openReport(page, makeAnalysis(), "long-resume.pdf");

    await copyButton(page).click();

    await expect(copyFeedback(page)).toHaveText("Summary copied");
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("Resume checks: 83/100 (5 of 6 passed)");
    expect(clipboardText).toMatch(
      /\n\nResume checks that need attention\n- Resume length: 2,566 words/,
    );
    expect(clipboardText).not.toContain("Job match");
  });

  test("a successful copy after a failed one is shown as a success", async ({ page }) => {
    await page.addInitScript(() => {
      let writeCount = 0;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => {
            writeCount += 1;
            return writeCount === 1
              ? Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"))
              : Promise.resolve();
          },
        },
      });
    });
    await openReport(page, makeAnalysis());

    await copyButton(page).click();
    await expect(copyFeedback(page)).toHaveText(COPY_FAILED_MESSAGE);
    await expect(copyFeedback(page)).toHaveClass(/report-action-feedback--error/);

    await copyButton(page).click();
    await expect(copyFeedback(page)).toHaveText("Summary copied");
    // Read once: a retrying not.toHaveClass() could pass only because the
    // message, and any wrong class with it, clears itself after 4 seconds.
    expect(await copyFeedback(page).getAttribute("class")).not.toContain(
      "report-action-feedback--error",
    );
  });

  for (const { title, initScript } of [
    {
      title: "the clipboard refuses the write",
      initScript: () => {
        navigator.clipboard.writeText = () =>
          Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
      },
    },
    {
      title: "the browser has no clipboard API",
      initScript: () => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      },
    },
  ]) {
    test(`says so when ${title}`, async ({ page }) => {
      await page.addInitScript(initScript);
      await openReport(page, makeAnalysis());

      await copyButton(page).click();

      await expect(copyFeedback(page)).toHaveText(COPY_FAILED_MESSAGE);
      await expect(copyFeedback(page)).toHaveClass(/report-action-feedback--error/);
      await expect(page.getByText("Summary copied")).toHaveCount(0);
    });
  }
});

test("Print or save as PDF opens the browser's print dialog", async ({ page }) => {
  await page.addInitScript(() => {
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls += 1;
    };
  });
  await openReport(page, makeAnalysis());

  await printButton(page).click();

  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
});

test("the print stylesheet shows only the report, ink on white", async ({ page }) => {
  await openReport(page, makeAnalysis({ jobMatch: makeJobMatch() }), "long-resume.pdf");

  const cards = page.locator(".dashboard-container .card");
  const cardCount = await cards.count();
  await expect(page.locator(".report-print-brand")).toBeHidden();

  await page.emulateMedia({ media: "print" });

  await expect(page.getByRole("button", { name: "Analyze another resume" })).toBeHidden();
  await expect(copyButton(page)).toBeHidden();
  await expect(printButton(page)).toBeHidden();
  await expect(copyFeedback(page)).toBeHidden();
  await expect(page.locator(".report-print-brand")).toHaveText("AI Resume Analyzer");
  await expect(page.locator(".report-print-brand")).toBeVisible();
  await expect(dashboardHeading(page)).toBeVisible();
  // It qualifies what was analyzed, so it stays in the printed report.
  await expect(page.locator(".truncation-notice")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job Match" })).toBeVisible();

  const colours = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      body: style("body").backgroundColor,
      card: style(".card").backgroundColor,
      heading: style(".dashboard-title").color,
      mutedText: style(".score-note").color,
      // Browsers leave out background colours when printing unless told
      // otherwise; the score ring and bars are drawn with them.
      scoreRingColourAdjust: style(".score-circle").getPropertyValue("print-color-adjust"),
      scoreBarColourAdjust: style(".score-bar-fill").getPropertyValue("print-color-adjust"),
    };
  });
  expect(colours).toEqual({
    body: "rgb(255, 255, 255)",
    card: "rgb(255, 255, 255)",
    // --print-ink
    heading: "rgb(20, 22, 37)",
    // --print-ink-muted (graphite)
    mutedText: "rgb(75, 81, 99)",
    scoreRingColourAdjust: "exact",
    scoreBarColourAdjust: "exact",
  });

  expect(cardCount).toBeGreaterThan(5);
  for (let index = 0; index < cardCount; index++) {
    const card = cards.nth(index);
    await expect(card).toBeVisible();
    expect(
      await card.evaluate((element) => {
        const style = getComputedStyle(element);
        return { breakInside: style.breakInside, boxShadow: style.boxShadow };
      }),
    ).toEqual({ breakInside: "avoid", boxShadow: "none" });
  }
});
