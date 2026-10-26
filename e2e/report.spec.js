import {
  addJobDescriptionButton,
  chooseFixture,
  dashboardHeading,
  expect,
  expectNoHorizontalOverflow,
  fileInput,
  jobDescriptionField,
  test,
  uploadHeading,
} from "./helpers/test.js";
import { makeAnalysis, makeJobMatch, replies, stubPuter } from "./helpers/puter.js";

const JOB_DESCRIPTION =
  "Senior Backend Engineer, Payments Platform. We are looking for an engineer with 5+ years of Go or Rust, Kubernetes and PostgreSQL.";

const INK = "rgb(20, 22, 37)";
const HIGHLIGHTER = "rgb(255, 226, 26)";
const RATING_COLOURS = {
  Excellent: "rgb(17, 105, 63)",
  Good: "rgb(143, 74, 0)",
  "Needs Improvement": "rgb(179, 38, 30)",
};

// Resumes the fixtures don't cover, printed to PDF by the browser. Arial
// without ligatures, so pdf.js reads back every word whole.
const PDF_TEXT_STYLE = "font: 12px Arial; font-variant-ligatures: none; white-space: nowrap";
// Short, with no numbers, contact details, links or section headings: it
// fails all six resume checks, a checks score of 0.
const FAILS_EVERY_CHECK = `<p style="${PDF_TEXT_STYLE}">Alex Rivera. I enjoy working with people and learning new things every day. I like building tidy spreadsheets and writing clear notes for my team.</p>`;
// A 59-character email address and a long link: two check details that are
// long tokens with no break opportunity (it fails the other four checks).
const LONG_CHECK_DETAILS = `<p style="${PDF_TEXT_STYLE}">Sam Okafor. ${"a".repeat(47)}@example.com https://example.com/${"p".repeat(150)} notes</p>`;

async function htmlToPdf(context, html) {
  const pdfPage = await context.newPage();
  await pdfPage.setContent(`<!doctype html><html><body>${html}</body></html>`);
  const buffer = await pdfPage.pdf({ width: "2400px", height: "600px" });
  await pdfPage.close();
  return buffer;
}

/** Waits until the report's opening motion has finished. */
async function settle(page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

/**
 * Analyzes a resume (a fixture, or `resumeHtml` printed to PDF) against
 * `analysis`, with the job description when `withJobDescription`.
 */
async function openReport(
  page,
  analysis,
  { fixture = "resume.pdf", resumeHtml = null, withJobDescription = false } = {},
) {
  await stubPuter(page, [replies.analysis(analysis)]);
  await page.goto("/");
  if (withJobDescription) {
    await addJobDescriptionButton(page).click();
    await jobDescriptionField(page).fill(JOB_DESCRIPTION);
  }
  if (resumeHtml) {
    await fileInput(page).setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: await htmlToPdf(page.context(), resumeHtml),
    });
  } else {
    await chooseFixture(page, fixture);
  }
  await expect(dashboardHeading(page)).toBeFocused();
  await settle(page);
}

async function openSample(page) {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await expect(uploadHeading(page)).toBeVisible();
  await page.getByRole("button", { name: "See a full sample report" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sample analysis report" }),
  ).toBeFocused();
  await settle(page);
}

const box = (locator) => locator.boundingBox();

test.describe("the verdict at 1280x720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const { title, open } of [
    { title: "the sample report", open: openSample },
    {
      title: "a report with a job description",
      open: (page) =>
        openReport(page, makeAnalysis({ jobMatch: makeJobMatch() }), { withJobDescription: true }),
    },
  ]) {
    test(`${title}: the score, the first three things to fix and the match are on the first screen`, async ({ page }) => {
      await open(page);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      const onFirstScreen = [
        ["the score", page.locator(".score-value")],
        ["the rating", page.locator(".score-badge")],
        ["the match", page.locator(".match-mark")],
        ...[0, 1, 2].map((index) => [
          `item ${index + 1} to fix`,
          page.locator(".fix-first-item").nth(index),
        ]),
      ];
      for (const [what, locator] of onFirstScreen) {
        const { y, height } = await box(locator);
        expect(y, `${what} top`).toBeGreaterThanOrEqual(0);
        expect(y + height, `${what} bottom`).toBeLessThanOrEqual(720);
      }

      // Side by side: the score block on the left, "Fix first" on the right.
      const scoreBox = await box(page.locator(".score-block"));
      const fixFirstBox = await box(page.locator(".fix-first"));
      expect(fixFirstBox.x).toBeGreaterThanOrEqual(scoreBox.x + scoreBox.width - 1);
      expect(Math.abs(fixFirstBox.y - scoreBox.y)).toBeLessThan(1);
    });
  }
});

test("the sample report's structure: one score, headings in order, and the match as a paragraph", async ({ page }) => {
  await openSample(page);

  await expect(page.getByRole("main")).toHaveCount(1);
  const headings = await page
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((elements) =>
      elements.map((element) => `${element.tagName[1]} ${element.textContent}`),
    );
  expect(headings).toEqual([
    "1 Sample analysis report",
    "2 Overall score",
    "2 Fix first",
    "3 After that",
    "2 Job match",
    "3 Matched keywords",
    "3 Missing keywords",
    "2 Writing quality",
    "3 Top strengths",
    "3 Insights",
    "2 Structure and ATS",
    "3 Resume checks",
    "3 ATS compatibility",
    "2 Keywords and roles",
    "3 Recommended keywords",
    "3 Roles to apply for",
  ]);

  // The score appears once, with its rating, and nothing else says it.
  await expect(page.locator(".score-value")).toHaveCount(1);
  await expect(page.locator(".score-value")).toHaveText("72");
  await expect(page.getByText("72", { exact: true })).toHaveCount(1);
  await expect(page.locator(".score-badge")).toHaveText("Good");
  await expect(page.locator(".score-breakdown-text")).toContainText("AI review 74");
  await expect(page.locator(".score-breakdown-text")).toContainText("Resume checks 67");

  // The match percentage is a paragraph in the score block, not a heading.
  const match = page.locator(".match-mark");
  expect(await match.evaluate((element) => element.tagName)).toBe("P");
  await expect(match).toHaveText(/^64%\s*Match with this role$/);
  await expect(page.getByRole("heading", { name: /64%|match with this role/i })).toHaveCount(0);

  // Nothing in the verdict can take focus, so it can be shown as a preview.
  expect(
    await page
      .locator(".verdict")
      .evaluate(
        (element) =>
          element.querySelectorAll("a[href], button, input, select, textarea, [tabindex]").length,
      ),
  ).toBe(0);
  // The AI's main improvements are listed once, in "Fix first".
  await expect(
    page.getByText("Lead each Lumen Freight bullet with the result, then the method"),
  ).toHaveCount(1);
});

test("the sample's Fix first panel: three items, then three more after that, each with its source", async ({ page }) => {
  await openSample(page);
  const panel = page.locator(".fix-first");

  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Fix first");
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("After that");
  const lists = panel.locator("ol");
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(0).locator("> li")).toHaveCount(3);
  await expect(lists.nth(1).locator("> li")).toHaveCount(3);
  // The second list carries on the numbering for screen readers too.
  await expect(lists.nth(1)).toHaveAttribute("start", "4");

  const items = panel.locator(".fix-first-item");
  await expect(items.locator(".fix-first-number")).toHaveText(["1", "2", "3", "4", "5", "6"]);
  await expect(items.locator(".fix-first-item-title")).toHaveText([
    "Lead each Lumen Freight bullet with the result, then the method",
    "Move Skills above Education so the tools are seen sooner",
    "Cut the summary to two sentences about the analysis you own",
    "Add keywords the job description asks for",
    "Add measurable results",
    "Add a LinkedIn or portfolio link",
  ]);
  await expect(items.locator(".fix-first-source")).toHaveText([
    "AI review",
    "AI review",
    "AI review",
    "Job description: A/B testing, Python, Experiment design",
    "Automated check: 2 measurable results found. Aim for at least 3.",
    "Automated check: No LinkedIn, GitHub or portfolio link found",
  ]);
});

test("a report with nothing to fix says so in the Fix first panel, beside the score block", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  // resume.pdf passes every check; no improvements and no job description.
  await openReport(page, makeAnalysis({ mainImprovements: [] }));

  const panel = page.locator(".fix-first");
  await expect(panel).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fix first" })).toHaveCount(1);
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Fix first");
  await expect(panel.locator("ol, li, .fix-first-item")).toHaveCount(0);
  await expect(panel.locator(".fix-first-empty-title")).toHaveText("Nothing to fix first.");
  await expect(panel.locator(".fix-first-empty-detail")).toHaveText(
    "Every automated check passed and the AI review suggested no main improvements.",
  );
  // A highlighter tick, hidden from screen readers.
  const tick = panel.locator(".fix-first-empty svg");
  await expect(tick).toHaveCount(1);
  await expect(tick).toHaveAttribute("aria-hidden", "true");
  expect(await tick.evaluate((icon) => getComputedStyle(icon).color)).toBe(HIGHLIGHTER);
  // No live region and nothing focusable in the verdict.
  expect(
    await page
      .locator(".verdict")
      .evaluate(
        (element) =>
          element.querySelectorAll(
            'a[href], button, input, select, textarea, [tabindex], [aria-live], [role="status"], [role="alert"]',
          ).length,
      ),
  ).toBe(0);

  // The frame keeps its two columns, 5 to 7, the panels level and as tall
  // as each other.
  const scoreBox = await box(page.locator(".score-block"));
  const panelBox = await box(panel);
  expect(panelBox.x).toBeGreaterThanOrEqual(scoreBox.x + scoreBox.width - 1);
  expect(Math.abs(panelBox.y - scoreBox.y)).toBeLessThan(1);
  expect(Math.abs(panelBox.height - scoreBox.height)).toBeLessThan(1);
  expect(scoreBox.width / panelBox.width).toBeCloseTo(5 / 7, 2);

  // Below a 60rem frame it stacks under the score block, as usual.
  for (const width of [768, 320]) {
    await page.setViewportSize({ width, height: 720 });
    const stackedScoreBox = await box(page.locator(".score-block"));
    const stackedPanelBox = await box(panel);
    expect(Math.abs(stackedPanelBox.x - stackedScoreBox.x)).toBeLessThan(1);
    expect(stackedPanelBox.y).toBeGreaterThanOrEqual(
      stackedScoreBox.y + stackedScoreBox.height - 1,
    );
    await expectNoHorizontalOverflow(page, width);
  }

  // On paper: an ink frame on white, ink text and an ink tick.
  await page.emulateMedia({ media: "print" });
  await expect(panel.locator(".fix-first-empty-title")).toBeVisible();
  await expect(tick).toBeVisible();
  expect(
    await panel.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        title: getComputedStyle(element.querySelector(".fix-first-empty-title")).color,
        detail: getComputedStyle(element.querySelector(".fix-first-empty-detail")).color,
        tick: getComputedStyle(element.querySelector(".fix-first-empty svg")).color,
      };
    }),
  ).toEqual({
    background: "rgb(255, 255, 255)",
    border: `2px solid ${INK}`,
    title: INK,
    detail: INK,
    tick: INK,
  });
});

test("a sheet without an executive summary has no second line under its top border", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openReport(page, makeAnalysis({ executiveSummary: "" }));

  await expect(page.locator(".report-lede")).toHaveCount(0);
  // Writing quality first; then Structure and ATS, Keywords and roles.
  const sectionBorders = await page
    .locator(".report-sheet-inner > .report-section")
    .evaluateAll((sections) =>
      sections.map((section) => getComputedStyle(section).borderTopWidth),
    );
  expect(sectionBorders).toEqual(["0px", "1px", "1px"]);
});

test.describe("the rating scale", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // resume.pdf passes every resume check (100), so the overall score is
  // 0.7 × AI + 30; FAILS_EVERY_CHECK scores 0, so 0 with an AI score of 0.
  for (const { aiScore, resumeHtml, overallScore, rating, band } of [
    { aiScore: 0, resumeHtml: FAILS_EVERY_CHECK, overallScore: 0, rating: "Needs Improvement", band: 0 },
    { aiScore: 42, overallScore: 59, rating: "Needs Improvement", band: 0 },
    { aiScore: 43, overallScore: 60, rating: "Good", band: 1 },
    { aiScore: 70, overallScore: 79, rating: "Good", band: 1 },
    { aiScore: 71, overallScore: 80, rating: "Excellent", band: 2 },
    { aiScore: 100, overallScore: 100, rating: "Excellent", band: 2 },
  ]) {
    test(`at ${overallScore}: the ${rating} band is filled and the marker sits at the score, inside the scale`, async ({ page }) => {
      await openReport(page, makeAnalysis({ overallScore: aiScore }), { resumeHtml });
      await expect(page.locator(".score-value")).toHaveText(String(overallScore));
      await expect(page.locator(".score-badge")).toHaveText(rating);

      const scale = await page.locator(".score-scale-track").evaluate((track) => {
        const rectOf = (element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        const bands = [...track.querySelectorAll(".score-scale-band")];
        const style = getComputedStyle(track);
        const outer = rectOf(track);
        return {
          track: outer,
          inner: {
            left: outer.left + parseFloat(style.borderLeftWidth),
            right: outer.right - parseFloat(style.borderRightWidth),
          },
          bands: bands.map(rectOf),
          activeBands: bands.flatMap((element, index) =>
            element.classList.contains("score-scale-band--active") ? [index] : [],
          ),
          activeColour: getComputedStyle(
            track.querySelector(".score-scale-band--active"),
          ).backgroundColor,
          marker: rectOf(track.querySelector(".score-scale-marker")),
        };
      });

      expect(scale.activeBands).toEqual([band]);
      expect(scale.activeColour).toBe(RATING_COLOURS[rating]);
      // Bands cut at 60 and 80 of the track's inner width.
      const innerWidth = scale.inner.right - scale.inner.left;
      expect(scale.bands[1].left).toBeCloseTo(scale.inner.left + 0.6 * innerWidth, 0);
      expect(scale.bands[2].left).toBeCloseTo(scale.inner.left + 0.8 * innerWidth, 0);

      // Inside the scale, even at 0 and 100.
      expect(scale.marker.left).toBeGreaterThanOrEqual(scale.track.left);
      expect(scale.marker.right).toBeLessThanOrEqual(scale.track.right);
      expect(scale.marker.top).toBeGreaterThanOrEqual(scale.track.top - 4);
      expect(scale.marker.bottom).toBeLessThanOrEqual(scale.track.bottom + 4);
      // Centred on the score, or as close as the ends allow.
      const radius = (scale.marker.right - scale.marker.left) / 2;
      const expectedCentre = Math.min(
        Math.max(scale.inner.left + (overallScore / 100) * innerWidth, scale.inner.left + radius),
        scale.inner.right - radius,
      );
      const centre = (scale.marker.left + scale.marker.right) / 2;
      expect(Math.abs(centre - expectedCentre)).toBeLessThan(1);
      expect(centre).toBeGreaterThanOrEqual(scale.bands[band].left - 1);
      expect(centre).toBeLessThanOrEqual(scale.bands[band].right + 1);

      // Drawn for sighted users; screen readers get the thresholds as text.
      await expect(page.locator(".score-scale-track")).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator(".score-scale-labels")).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator(".score-scale-label")).toHaveText(["0", "60", "80", "100"]);
      await expect(page.locator(".score-scale .visually-hidden")).toHaveText(
        "Ratings: Needs Improvement below 60, Good from 60, Excellent from 80.",
      );
    });
  }
});

test.describe("severity marks", () => {
  for (const { title, open, flags, ticks } of [
    // Fails the measurable results and profile link checks, and one ATS item.
    { title: "the sample report", open: openSample, flags: 3, ticks: 7 },
    // Fails the length check; the AI fails one of four ATS items.
    {
      title: "the long resume's report",
      open: (page) => openReport(page, makeAnalysis(), { fixture: "long-resume.pdf" }),
      flags: 2,
      ticks: 8,
    },
  ]) {
    test(`${title}: a yellow Fix flag on each failed check and ATS item, an ink tick on each passed one`, async ({ page }) => {
      await open(page);

      await expect(page.locator(".fix-flag")).toHaveCount(flags);
      await expect(page.locator(".pass-mark")).toHaveCount(ticks);
      // Every failed row says so in words, not colour alone: an X and "Fix"
      // on screen, "Needs attention:" for screen readers.
      const flaggedRows = page.locator(".marked-row").filter({ has: page.locator(".fix-flag") });
      await expect(flaggedRows).toHaveCount(flags);
      for (const row of await flaggedRows.all()) {
        await expect(row).toHaveText(/^Needs attention: /);
        await expect(row.locator(".fix-flag")).toHaveText("Fix");
        await expect(row.locator(".fix-flag svg")).toHaveCount(1);
        await expect(row.locator(".fix-flag")).toHaveAttribute("aria-hidden", "true");
      }
      for (const row of await page
        .locator(".marked-row")
        .filter({ has: page.locator(".pass-mark") })
        .all()) {
        await expect(row).toHaveText(/^Passed: /);
      }
      // Highlighter only ever sits on paper inside a 2px ink border.
      for (const selector of [".fix-flag", ".keyword--matched"]) {
        for (const element of await page.locator(selector).all()) {
          expect(
            await element.evaluate((node) => {
              const style = getComputedStyle(node);
              return `${style.backgroundColor} ${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor} ${style.borderLeftWidth} ${style.borderRightWidth} ${style.borderBottomWidth}`;
            }),
          ).toBe(`${HIGHLIGHTER} 2px solid ${INK} 2px 2px 2px`);
        }
      }
    });
  }
});

// The sheet's margin column needs a 56rem (896px) sheet: a 944px window,
// less the 24px gutters. The verdict's side-by-side layout needs a 60rem
// frame: a 1016px window, less the gutters and the 8px shadow.
for (const { width, isWideSheet, isWideVerdict } of [
  { width: 1440, isWideSheet: true, isWideVerdict: true },
  { width: 1024, isWideSheet: true, isWideVerdict: true },
  { width: 1016, isWideSheet: true, isWideVerdict: true },
  { width: 1015, isWideSheet: true, isWideVerdict: false },
  { width: 944, isWideSheet: true, isWideVerdict: false },
  { width: 943, isWideSheet: false, isWideVerdict: false },
  { width: 768, isWideSheet: false, isWideVerdict: false },
  { width: 390, isWideSheet: false, isWideVerdict: false },
]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`the sheet ${isWideSheet ? "has its margin rule and marks column" : "is one column, marks at the rows' ends"}; the verdict is ${isWideVerdict ? "side by side" : "stacked"}`, async ({ page }) => {
      await openSample(page);

      const layout = await page.locator(".report-sheet-inner").evaluate((sheet) => {
        const rectOf = (element) => element.getBoundingClientRect();
        // Where an element's first line sits on its baseline: the bottom of
        // an empty inline-block put at its start, then removed.
        const baselineOf = (element) => {
          const probe = document.createElement("span");
          probe.style.display = "inline-block";
          element.prepend(probe);
          const baseline = rectOf(probe).bottom;
          probe.remove();
          return baseline;
        };
        const sheetRect = rectOf(sheet);
        const style = getComputedStyle(sheet);
        const rule = getComputedStyle(sheet, "::after");
        const contentRight = sheetRect.right - parseFloat(style.borderRightWidth);
        const rowMarks = [...sheet.querySelectorAll(".marked-row")].map((row) => {
          const rowRect = rectOf(row);
          const mark = row.querySelector(".marked-row-mark > *");
          const firstLine = row.querySelector(".marked-row-body > *");
          const markRect = rectOf(mark);
          return {
            isScore: mark.matches(".margin-mark"),
            left: markRect.left,
            right: markRect.right,
            rowRight: rowRect.right,
            topGap: Math.abs(markRect.top - rectOf(firstLine).top),
            baselineGap: Math.abs(baselineOf(mark) - baselineOf(firstLine)),
          };
        });
        const counts = [...sheet.querySelectorAll(".report-block-count")].map((count) => {
          const heading = count.parentElement.querySelector("h3");
          const text = document.createRange();
          text.selectNodeContents(count);
          return {
            left: rectOf(count).left,
            right: rectOf(count).right,
            contentBoxRight:
              rectOf(count).right - parseFloat(getComputedStyle(count).paddingRight),
            textRight: text.getBoundingClientRect().right,
            lines: new Set([...text.getClientRects()].map((line) => Math.round(line.top))).size,
            top: rectOf(count).top,
            headingTop: rectOf(heading).top,
            headingBottom: rectOf(heading).bottom,
          };
        });
        return {
          marginRule: {
            content: rule.content,
            position: rule.position,
            right: rule.right,
            width: rule.width,
            colour: rule.backgroundColor,
          },
          marksColumnLeft: contentRight - 13 * 16,
          contentRight,
          rowMarks,
          counts,
        };
      });

      // 4 metric scores, 6 resume checks, 4 ATS items; 2 counts.
      expect(layout.rowMarks).toHaveLength(14);
      expect(layout.rowMarks.filter((mark) => mark.isScore)).toHaveLength(4);
      expect(layout.counts).toHaveLength(2);
      for (const mark of layout.rowMarks) {
        // Level with the row's first line: a score on its baseline, a tick
        // or flag at its top.
        expect(mark.topGap).toBeLessThan(10);
        if (mark.isScore) {
          expect(mark.baselineGap, "a score on its row's baseline").toBeLessThan(1);
        } else {
          expect(mark.topGap, "a tick or flag level with its row's top").toBeLessThan(1);
        }
      }
      if (isWideSheet) {
        // A 2px ink rule 13rem from the sheet's inner right edge.
        expect(layout.marginRule).toEqual({
          content: '""',
          position: "absolute",
          right: "208px",
          width: "2px",
          colour: INK,
        });
        for (const mark of [...layout.rowMarks, ...layout.counts]) {
          expect(mark.left).toBeGreaterThanOrEqual(layout.marksColumnLeft);
          expect(mark.right).toBeLessThanOrEqual(layout.contentRight);
        }
        // Level with the heading, on one line inside the column's padding.
        for (const count of layout.counts) {
          expect(count.top).toBeLessThan(count.headingBottom);
          expect(count.lines, "a count on one line").toBe(1);
          expect(count.textRight, "a count inside its column").toBeLessThanOrEqual(
            count.contentBoxRight,
          );
        }

        // The rule runs over the sections' 1px dividers, not under them.
        const ruleOnTop = await page.locator(".report-sheet-inner").evaluate((sheet) => {
          const sheetRect = sheet.getBoundingClientRect();
          const innerRight = sheetRect.right - parseFloat(getComputedStyle(sheet).borderRightWidth);
          const results = [...sheet.querySelectorAll(".report-section")].map((section) => {
            // Its top in the viewport, clear of the sample banner.
            window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top - 200);
            const y = section.getBoundingClientRect().top + 0.5;
            // The middle of the 2px rule.
            return document.elementFromPoint(innerRight - 13 * 16 - 1, y) === sheet;
          });
          window.scrollTo(0, 0);
          return results;
        });
        expect(ruleOnTop, "the margin rule over each section's divider").toEqual([
          true,
          true,
          true,
          true,
        ]);
      } else {
        expect(layout.marginRule.content).toBe("none");
        for (const mark of layout.rowMarks) {
          expect(Math.abs(mark.right - mark.rowRight)).toBeLessThan(1);
        }
        for (const count of layout.counts) {
          expect(count.top).toBeGreaterThanOrEqual(count.headingBottom - 1);
        }
      }

      const scoreBox = await box(page.locator(".score-block"));
      const fixFirstBox = await box(page.locator(".fix-first"));
      if (isWideVerdict) {
        expect(fixFirstBox.x).toBeGreaterThan(scoreBox.x + scoreBox.width - 1);
      } else {
        // Stacked, the score first.
        expect(Math.abs(fixFirstBox.x - scoreBox.x)).toBeLessThan(1);
        expect(fixFirstBox.y).toBeGreaterThanOrEqual(scoreBox.y + scoreBox.height - 1);
      }
      await expectNoHorizontalOverflow(page, width);
    });
  });
}

test.describe("signature motion", () => {
  /** Pauses every CSS animation at `time` ms and reads the score block. */
  const frameAt = (page, time) =>
    page.evaluate((currentTime) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = currentTime;
      }
      const highlight = getComputedStyle(document.querySelector(".score-block"), "::before");
      const value = getComputedStyle(document.querySelector(".score-value"));
      // scaleX of the highlight; the scale, angle and opacity of the score.
      const [a, b] = (value.transform.match(/matrix\(([^)]+)\)/)?.[1] ?? "1, 0")
        .split(",")
        .map(Number);
      return {
        highlightScaleX:
          highlight.transform === "none"
            ? 1
            : Number(highlight.transform.match(/matrix\(([^,]+)/)[1]),
        stampScale: Math.hypot(a, b),
        stampDegrees: (Math.atan2(b, a) * 180) / Math.PI,
        stampOpacity: Number(value.opacity),
      };
    }, time);

  test("opening a report sweeps the highlighter across the score block, then stamps the score", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openSample(page);

    expect(
      await page.locator(".score-block").evaluate((element) => {
        const before = getComputedStyle(element, "::before");
        const value = getComputedStyle(element.querySelector(".score-value"));
        return [
          [before.animationName, before.animationDuration, before.animationDelay, before.transformOrigin.split(" ")[0]],
          [value.animationName, value.animationDuration, value.animationDelay, value.animationTimingFunction],
        ];
      }),
    ).toEqual([
      // From the left edge.
      ["score-highlight", "0.28s", "0s", "0px"],
      ["score-stamp", "0.42s", "0.18s", "cubic-bezier(0.16, 1, 0.3, 1)"],
    ]);

    // 0ms: no highlight yet, and the score not yet stamped.
    const start = await frameAt(page, 0);
    expect(start.highlightScaleX).toBe(0);
    expect(start.stampOpacity).toBe(0);
    // 120ms: the highlight part way across; the stamp still waiting.
    const sweeping = await frameAt(page, 120);
    expect(sweeping.highlightScaleX).toBeGreaterThan(0);
    expect(sweeping.highlightScaleX).toBeLessThan(1);
    expect(sweeping.stampOpacity).toBe(0);
    // 300ms: the highlight across; the score coming down, large and tilted.
    const stamping = await frameAt(page, 300);
    expect(stamping.highlightScaleX).toBe(1);
    expect(stamping.stampOpacity).toBeGreaterThan(0);
    expect(stamping.stampScale).toBeGreaterThan(1);
    expect(stamping.stampScale).toBeLessThan(1.35);
    expect(stamping.stampDegrees).toBeLessThan(-2);
    // 600ms: stamped at -2°.
    const end = await frameAt(page, 600);
    expect(end.stampOpacity).toBe(1);
    expect(end.stampScale).toBeCloseTo(1, 3);
    expect(end.stampDegrees).toBeCloseTo(-2, 2);
  });

  test("with prefers-reduced-motion: reduce, the report opens already drawn", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSample(page);

    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    const drawn = await frameAt(page, 0);
    expect(drawn.highlightScaleX).toBe(1);
    expect(drawn.stampOpacity).toBe(1);
    expect(drawn.stampScale).toBeCloseTo(1, 3);
    expect(drawn.stampDegrees).toBeCloseTo(-2, 2);
  });
});

test.describe("the sample banner on a short phone screen", () => {
  test.use({ viewport: { width: 390, height: 640 } });

  test("stays at the top while the sample scrolls, and never covers the control Tab moves to", async ({ page }) => {
    await openSample(page);
    const banner = page.locator(".sample-banner");
    const copyButton = page.getByRole("button", { name: "Copy summary" });

    // Scrolled so that Copy summary is just under the banner, while the
    // title keeps focus.
    const bannerHeight = (await box(banner)).height;
    await page.evaluate(() => {
      const top = document.querySelector(".report-action-btn").getBoundingClientRect().top;
      window.scrollTo(0, window.scrollY + top - 10);
    });
    expect((await box(banner)).y).toBe(0);
    expect((await box(copyButton)).y).toBeLessThan(bannerHeight);

    await page.keyboard.press("Tab");
    await expect(copyButton).toBeFocused();
    // The page scrolled it out from under the banner.
    expect((await box(banner)).y).toBe(0);
    expect((await box(copyButton)).y).toBeGreaterThanOrEqual(bannerHeight);
  });
});

// Long tokens with no break opportunity in every AI field, the longest
// check details the checks produce, three-digit scores and the longest
// rating, at every width the layout changes between.
const TOKEN = "Q".repeat(300);
const longAnalysis = (overallScore) =>
  makeAnalysis({
    overallScore,
    executiveSummary: `Summary ${TOKEN} end.`,
    topStrengths: [TOKEN, "Clear impact metrics"],
    mainImprovements: [TOKEN, "Shorten the summary"],
    performanceMetrics: [
      { name: TOKEN, score: 100 },
      { name: "Brevity & Formatting", score: 100 },
      { name: "Action Verbs Usage", score: 0 },
    ],
    resumeInsights: [TOKEN],
    atsOptimization: `ATS ${TOKEN}`,
    atsCompatibilityChecklist: [
      { item: TOKEN, passed: false },
      { item: "Standard Font Usage", passed: true },
    ],
    recommendedKeywords: [TOKEN, "gRPC"],
    recommendedRoles: [TOKEN, "Staff Engineer"],
    jobMatch: makeJobMatch({
      matchScore: 100,
      summary: `Match ${TOKEN}`,
      matchedKeywords: [TOKEN, "Go"],
      missingKeywords: [TOKEN, "Rust"],
    }),
  });

for (const { title, analysis, resumeHtml, score, rating } of [
  { title: "a score of 100", analysis: longAnalysis(100), score: "100", rating: "Excellent" },
  {
    title: "Needs Improvement and long check details",
    analysis: longAnalysis(0),
    resumeHtml: LONG_CHECK_DETAILS,
    // 0.7 × 0 + 0.3 × 33 (2 of 6 checks passed)
    score: "10",
    rating: "Needs Improvement",
  },
]) {
  test(`${title}, with long tokens everywhere, fits every width from 1440 to 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReport(page, analysis, { resumeHtml, withJobDescription: true });
    await expect(page.locator(".score-value")).toHaveText(score);
    await expect(page.locator(".score-badge")).toHaveText(rating);
    await expect(page.locator(".match-mark-value")).toHaveText("100%");
    if (resumeHtml) {
      await expect(page.locator(".check-detail")).toContainText([`${"a".repeat(47)}@example.com`]);
    }

    for (const width of [1440, 1280, 1024, 960, 768, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page, width);

      // The score, its rating and the match fit their block on one line.
      const fits = await page.locator(".score-block").evaluate((block) => {
        const blockRect = block.getBoundingClientRect();
        return [".score-value", ".score-badge", ".match-mark-value"].map((selector) => {
          const element = block.querySelector(selector);
          const rect = element.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          const lines = new Set(
            [...range.getClientRects()].map((lineRect) => Math.round(lineRect.top)),
          ).size;
          return {
            selector,
            inside: rect.left >= blockRect.left && rect.right <= blockRect.right,
            lines,
          };
        });
      });
      for (const { selector, inside, lines } of fits) {
        expect(inside, `${selector} inside the score block at ${width}px`).toBe(true);
        expect(lines, `${selector} on one line at ${width}px`).toBe(1);
      }

      // Nothing in the verdict is wider than its panel: the frame's
      // overflow: hidden would cut it off without widening the page.
      const panels = await page.locator(".verdict-frame").evaluate((frame) =>
        [".score-block", ".fix-first"].map((selector) => {
          const panel = frame.querySelector(selector);
          return { selector, scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth };
        }),
      );
      for (const { selector, scrollWidth, clientWidth } of panels) {
        expect(scrollWidth, `${selector} content fits at ${width}px`).toBeLessThanOrEqual(
          clientWidth,
        );
      }

      // Every row mark (scores, ticks, flags) on one line inside the sheet.
      const marks = await page.locator(".report-sheet-inner").evaluate((sheet) => {
        const right = sheet.getBoundingClientRect().right;
        return [...sheet.querySelectorAll(".marked-row-mark")].map((mark) => {
          const rect = mark.firstElementChild.getBoundingClientRect();
          return rect.right <= right && rect.height < 40;
        });
      });
      expect(marks.every(Boolean), `marks inside the sheet at ${width}px`).toBe(true);
    }
  });
}
