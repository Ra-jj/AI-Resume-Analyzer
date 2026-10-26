import {
  addJobDescriptionButton,
  chooseFixture,
  dashboardHeading,
  expect,
  expectNoHorizontalOverflow,
  fileInput,
  isPdfLibraryUrl,
  isPdfWorkerUrl,
  jobDescriptionField,
  loadingHeading,
  test,
  uploadHeading,
} from "./helpers/test.js";
import { getPuterCalls, releaseHeldReply, replies, stubPuter } from "./helpers/puter.js";

const INK = "rgb(20, 22, 37)";
const HIGHLIGHTER = "rgb(255, 226, 26)";
const INTRO =
  "This is the top of a real report, made from a fictional data analyst's resume and a fictional job description.";
const FIX_FIRST_TITLES = [
  "Lead each Lumen Freight bullet with the result, then the method",
  "Move Skills above Education so the tools are seen sooner",
  "Cut the summary to two sentences about the analysis you own",
  "Add keywords the job description asks for",
  "Add measurable results",
  "Add a LinkedIn or portfolio link",
];
// Anything that can take focus, by keyboard or from script.
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex], [contenteditable]";
const LIVE_REGION = '[role="status"], [role="alert"], [aria-live]';

const sampleSection = (page) => page.getByRole("region", { name: "Sample report" });
const preview = (page) => page.locator(".sample-preview");
const sampleButton = (page) => page.getByRole("button", { name: "See a full sample report" });
const sampleHeading = (page) =>
  page.getByRole("heading", { level: 1, name: "Sample analysis report" });
const backToHomeButton = (page) => page.getByRole("button", { name: "Back to home" });

async function openHome(page) {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await expect(uploadHeading(page)).toBeVisible();
}

/** Records every pdf.js (library chunk or worker) and Puter request from now on. */
function trackRequests(page) {
  const requests = { pdf: [], puter: [] };
  page.on("request", (request) => {
    const url = request.url();
    if (isPdfLibraryUrl(url) || isPdfWorkerUrl(url)) requests.pdf.push(url);
    if (/(^|\.)puter\.com$/.test(new URL(url).hostname)) requests.puter.push(url);
  });
  return requests;
}

/** The verdict frame's border, corner radius and hard shadow. */
function frameStyleOf(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
    };
  });
}

test.describe("the home page's sample section", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("sits between How it works and What happens to your resume, with its tag, intro and the sample's verdict", async ({ page }) => {
    await openHome(page);

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Upload your resume",
      "How it works",
      "Sample report",
      "What happens to your resume",
    ]);
    const section = sampleSection(page);
    await expect(section).toBeVisible();

    // The tag is a highlighter label in an ink frame: not a heading, and
    // not a live region.
    const fictionalTag = section.getByText("Fictional resume", { exact: true });
    await expect(fictionalTag).toBeVisible();
    expect(
      await fictionalTag.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          background: style.backgroundColor,
          border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
          liveRegion: element.closest('[role="status"], [role="alert"], [aria-live]'),
        };
      }),
    ).toEqual({ tag: "P", background: HIGHLIGHTER, border: `2px solid ${INK}`, liveRegion: null });
    await expect(section.locator(".sample-intro")).toHaveText(INTRO);

    // The report's own verdict, one heading level down under "Sample report".
    const headings = await section
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((elements) =>
        elements.map((element) => `${element.tagName[1]} ${element.textContent}`),
      );
    expect(headings).toEqual(["2 Sample report", "3 Overall score", "3 Fix first", "4 After that"]);
    await expect(preview(page).locator(".score-value")).toHaveText("72");
    await expect(preview(page).locator(".score-badge")).toHaveText("Good");
    await expect(preview(page).locator(".score-breakdown-text")).toContainText("AI review 74");
    await expect(preview(page).locator(".score-breakdown-text")).toContainText("Resume checks 67");
    await expect(preview(page).locator(".match-mark")).toHaveText(/^64%\s*Match with this role$/);
    await expect(preview(page).locator(".fix-first-item-title")).toHaveText(FIX_FIRST_TITLES);

    // Nothing in the preview can take focus or speaks up; the section's only
    // control is the button under it, and the page keeps its one status line.
    expect(
      await preview(page).evaluate(
        (element, selector) => element.querySelectorAll(selector).length,
        `${FOCUSABLE}, ${LIVE_REGION}`,
      ),
    ).toBe(0);
    expect(
      await section.evaluate(
        (element, selector) =>
          [...element.querySelectorAll(selector)].map((control) => control.textContent),
        FOCUSABLE,
      ),
    ).toEqual(["See a full sample report"]);
    await expect(page.locator(LIVE_REGION)).toHaveCount(1);
    await expect(page.getByRole("status")).toHaveCount(1);

    // The button comes after the preview.
    const frameBox = await preview(page).locator(".verdict-frame").boundingBox();
    const buttonBox = await sampleButton(page).boundingBox();
    expect(buttonBox.y).toBeGreaterThan(frameBox.y + frameBox.height);
  });

  test("the preview is the report's frame at full size, uncropped", async ({ page }) => {
    await openHome(page);
    const frame = preview(page).locator(".verdict-frame");

    const layout = await frame.evaluate((element) => {
      const section = element.closest(".sample-section");
      const sectionStyle = getComputedStyle(section);
      const sectionRect = section.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const ancestors = [];
      for (let node = element; node !== section; node = node.parentElement) {
        const style = getComputedStyle(node);
        ancestors.push({ transform: style.transform, overflow: style.overflow, zoom: style.zoom });
      }
      return {
        columnLeft: sectionRect.left + parseFloat(sectionStyle.paddingLeft),
        columnRight: sectionRect.right - parseFloat(sectionStyle.paddingRight),
        sectionTop: sectionRect.top,
        sectionBottom: sectionRect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        // A scaled frame is drawn at a different size from its layout box.
        drawnVersusLaidOut: rect.width - element.offsetWidth,
        shadowOffset: parseFloat(getComputedStyle(element).boxShadow.split(" ").at(-4)),
        // The frame clips its own panels to its corners; nothing above it
        // may clip or scale it.
        ancestors: ancestors.slice(1),
      };
    });
    expect(layout.drawnVersusLaidOut).toBe(0);
    expect(layout.shadowOffset).toBe(8);
    // The width of the content column, its hard shadow included.
    expect(Math.abs(layout.left - layout.columnLeft)).toBeLessThan(1);
    expect(Math.abs(layout.right + layout.shadowOffset - layout.columnRight)).toBeLessThan(1);
    expect(layout.top).toBeGreaterThan(layout.sectionTop);
    expect(layout.bottom + layout.shadowOffset).toBeLessThan(layout.sectionBottom);
    for (const ancestor of layout.ancestors) {
      expect(ancestor).toEqual({ transform: "none", overflow: "visible", zoom: "1" });
    }

    // Side by side at this width, as on the report.
    const scoreBox = await preview(page).locator(".score-block").boundingBox();
    const fixFirstBox = await preview(page).locator(".fix-first").boundingBox();
    expect(fixFirstBox.x).toBeGreaterThanOrEqual(scoreBox.x + scoreBox.width - 1);
    expect(Math.abs(fixFirstBox.y - scoreBox.y)).toBeLessThan(1);

    // The same frame and shadow as the report draws.
    const homeFrameStyle = await frameStyleOf(frame);
    expect(homeFrameStyle).toEqual({
      border: `2px solid ${INK}`,
      radius: "6px",
      shadow: `${INK} 8px 8px 0px 0px`,
    });
    await sampleButton(page).click();
    await expect(sampleHeading(page)).toBeFocused();
    expect(await frameStyleOf(page.locator(".verdict-frame"))).toEqual(homeFrameStyle);
  });

  // The report's highlighter sweep and score stamp play when a report
  // opens; the preview shows their end state, with or without reduced motion.
  for (const reducedMotion of ["no-preference", "reduce"]) {
    test(`the preview never animates, with prefers-reduced-motion: ${reducedMotion}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await openHome(page);

      const motion = () =>
        preview(page).evaluate((element) => ({
          animations: element
            .getAnimations({ subtree: true })
            .map((animation) => animation.animationName ?? animation.id),
          highlight: getComputedStyle(element.querySelector(".score-block"), "::before")
            .animationName,
          stamp: getComputedStyle(element.querySelector(".score-value")).animationName,
        }));
      expect(await motion()).toEqual({ animations: [], highlight: "none", stamp: "none" });
      await preview(page).scrollIntoViewIfNeeded();
      expect(await motion()).toEqual({ animations: [], highlight: "none", stamp: "none" });
      // Drawn in its final state: the highlighter across the block, the
      // score tilted like a stamp.
      expect(
        await preview(page).evaluate((element) => ({
          highlight: getComputedStyle(element.querySelector(".score-block"), "::before")
            .transform,
          stamp: getComputedStyle(element.querySelector(".score-value")).transform,
          opacity: getComputedStyle(element.querySelector(".score-value")).opacity,
        })),
      ).toEqual({
        highlight: "none",
        // rotate(-2deg)
        stamp: expect.stringMatching(/^matrix\(0\.999391, -0\.0348995, 0\.0348995, 0\.999391, 0, 0\)$/),
        opacity: "1",
      });

      // The report itself keeps its motion.
      await sampleButton(page).click();
      await expect(sampleHeading(page)).toBeFocused();
      const reportAnimations = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSAnimation)
          .map((animation) => animation.animationName)
          .sort(),
      );
      expect(reportAnimations).toEqual(
        reducedMotion === "reduce" ? [] : ["score-highlight", "score-stamp"],
      );
    });
  }

  test("loading and scrolling through the home page fetch no pdf.js, call no AI and format neither 5,000 nor 15,000", async ({ page }) => {
    // The error-boundary tests make toLocaleString throw for 5,000 (the job
    // description counter) and 15,000 (the truncation notice), so the
    // preview must never format either.
    await page.addInitScript(() => {
      window.__formattedNumbers = [];
      const original = Number.prototype.toLocaleString;
      Number.prototype.toLocaleString = function toLocaleString(...args) {
        window.__formattedNumbers.push(Number(this));
        return original.apply(this, args);
      };
    });
    const requests = trackRequests(page);
    await openHome(page);
    await page.waitForLoadState("networkidle");
    // Building the sample runs the resume checks once, and the length check
    // formats the word count. Nothing else on the page formats a number.
    const formattedOnLoad = await page.evaluate(() => window.__formattedNumbers);
    expect(formattedOnLoad).toHaveLength(1);
    expect(formattedOnLoad[0]).toBeGreaterThanOrEqual(300);
    expect(formattedOnLoad[0]).toBeLessThanOrEqual(1000);

    for (const target of [preview(page), sampleButton(page), page.getByRole("contentinfo")]) {
      await target.scrollIntoViewIfNeeded();
    }
    await page.waitForLoadState("networkidle");

    expect(requests.pdf).toEqual([]);
    // Only index.html's Puter script tag (stubbed here); nothing calls it.
    expect(requests.puter).toEqual(["https://js.puter.com/v2/"]);
    expect(await getPuterCalls(page)).toEqual([]);
    expect(await page.evaluate(() => window.__formattedNumbers)).toEqual(formattedOnLoad);
  });

  test("typing a job description leaves the preview untouched", async ({ page }) => {
    await openHome(page);
    // From here on, only the counter ("28 / 5,000") may format numbers.
    await page.evaluate(() => {
      window.__formattedNumbers = [];
      const original = Number.prototype.toLocaleString;
      Number.prototype.toLocaleString = function toLocaleString(...args) {
        window.__formattedNumbers.push(Number(this));
        return original.apply(this, args);
      };
    });
    await preview(page).evaluate((element) => {
      window.__previewMutations = 0;
      new MutationObserver((mutations) => {
        window.__previewMutations += mutations.length;
      }).observe(element, { subtree: true, childList: true, attributes: true, characterData: true });
    });

    await addJobDescriptionButton(page).click();
    await jobDescriptionField(page).pressSequentially("Data analyst, SQL and Python");
    await expect(page.locator(".jd-count")).toHaveText("28 / 5,000");

    expect(await page.evaluate(() => window.__previewMutations)).toBe(0);
    await expect(preview(page).locator(".score-value")).toHaveText("72");
    const formatted = await page.evaluate(() => window.__formattedNumbers);
    expect(formatted.length).toBeGreaterThan(0);
    for (const number of formatted) {
      expect(number === 5_000 || (number >= 0 && number <= 28), String(number)).toBe(true);
    }
  });

  test("is hidden while a resume is analyzed, and back afterwards", async ({ page }) => {
    await stubPuter(page, [replies.heldAnalysis()]);
    await page.goto("/");
    await expect(sampleSection(page)).toBeVisible();

    await chooseFixture(page, "resume.pdf");
    await expect(loadingHeading(page)).toBeVisible();
    await expect(sampleSection(page)).toHaveCount(0);
    await expect(preview(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Overall score" })).toHaveCount(0);

    await releaseHeldReply(page);
    await expect(dashboardHeading(page)).toBeFocused();
    await page.getByRole("button", { name: "Analyze another resume" }).click();
    await expect(fileInput(page)).toBeFocused();
    await expect(preview(page).locator(".score-value")).toHaveText("72");
    await expect(sampleButton(page)).toBeVisible();
  });

  test("the button under the preview opens the sample, and Back to home returns focus to it", async ({ page }) => {
    await openHome(page);
    await sampleButton(page).click();
    await expect(sampleHeading(page)).toBeFocused();

    await backToHomeButton(page).click();
    await expect(sampleButton(page)).toBeFocused();
    await expect(sampleButton(page)).toBeInViewport();
    await expect(preview(page).locator(".score-value")).toHaveText("72");
  });

  test("a preview that fails to render leaves the section's heading and button, and uploading works", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    // Building the sample parses its fixed AI reply, the only JSON on the
    // home page that mentions Lumen Freight. Making that parse throw fails
    // the preview (and the full sample) without touching app code.
    await page.addInitScript(() => {
      const original = JSON.parse;
      JSON.parse = function parse(text, ...rest) {
        if (typeof text === "string" && text.includes("Lumen Freight")) {
          throw new Error("e2e: forced sample failure");
        }
        return original.call(this, text, ...rest);
      };
    });
    await openHome(page);

    const section = sampleSection(page);
    await expect(section.getByRole("heading", { level: 2, name: "Sample report" })).toBeVisible();
    await expect(section.getByText("Fictional resume", { exact: true })).toBeVisible();
    await expect(sampleButton(page)).toBeVisible();
    await expect(preview(page)).toHaveCount(0);
    await expect(section.locator(".sample-intro")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect
      .poll(() =>
        consoleErrors.some((text) => text.startsWith("[ErrorBoundary:sample-preview] render failed:")),
      )
      .toBe(true);
    expect(consoleErrors.some((text) => text.startsWith("[ErrorBoundary:app]"))).toBe(false);
    // Spaced from the heading, as it would be from the preview.
    const headingBox = await section.getByRole("heading", { level: 2 }).boundingBox();
    const buttonBox = await sampleButton(page).boundingBox();
    expect(buttonBox.y - (headingBox.y + headingBox.height)).toBeGreaterThanOrEqual(20);

    // The full sample can't be built either: its own fallback leads home.
    await sampleButton(page).click();
    const fallback = page.getByRole("alert");
    await expect(fallback).toContainText("The sample report couldn't be displayed");
    await fallback.getByRole("button", { name: "Back to home" }).click();
    await expect(sampleButton(page)).toBeFocused();

    await chooseFixture(page, "resume.pdf");
    await expect(dashboardHeading(page)).toBeFocused();
    expect(await getPuterCalls(page)).toHaveLength(1);
  });
});

// Side by side once the frame is 60rem wide, as on the report; stacked
// below that. Checked with the job description closed and open with a
// long, unbreakable posting.
const LONG_TOKEN = "SeniorDataAnalystExperimentationAndForecastingPlatformTeam".repeat(3);
for (const { width, height, sideBySide } of [
  { width: 1440, height: 900, sideBySide: true },
  { width: 1280, height: 720, sideBySide: true },
  { width: 1024, height: 768, sideBySide: true },
  { width: 960, height: 720, sideBySide: false },
  { width: 768, height: 1024, sideBySide: false },
  { width: 390, height: 844, sideBySide: false },
  { width: 360, height: 800, sideBySide: false },
  { width: 320, height: 700, sideBySide: false },
]) {
  test.describe(`the sample section at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test(`fits the screen, ${sideBySide ? "side by side" : "stacked"}, with the job description closed and open`, async ({ page }) => {
      await openHome(page);
      const shadowOffset = width < 600 ? 6 : 8;

      const expectFits = async () => {
        await expectNoHorizontalOverflow(page, width);
        const sectionBox = await sampleSection(page).boundingBox();
        expect(sectionBox.x).toBeGreaterThanOrEqual(0);
        expect(sectionBox.x + sectionBox.width).toBeLessThanOrEqual(width);
        const frame = preview(page).locator(".verdict-frame");
        const frameBox = await frame.boundingBox();
        expect(
          await frame.evaluate((element) =>
            parseFloat(getComputedStyle(element).boxShadow.split(" ").at(-4)),
          ),
        ).toBe(shadowOffset);
        expect(frameBox.x + frameBox.width + shadowOffset).toBeLessThanOrEqual(width);
        const buttonBox = await sampleButton(page).boundingBox();
        expect(buttonBox.x + buttonBox.width + 3).toBeLessThanOrEqual(width);

        const scoreBox = await preview(page).locator(".score-block").boundingBox();
        const fixFirstBox = await preview(page).locator(".fix-first").boundingBox();
        if (sideBySide) {
          expect(fixFirstBox.x).toBeGreaterThanOrEqual(scoreBox.x + scoreBox.width - 1);
          expect(Math.abs(fixFirstBox.y - scoreBox.y)).toBeLessThan(1);
        } else {
          expect(Math.abs(fixFirstBox.x - scoreBox.x)).toBeLessThan(1);
          expect(fixFirstBox.y).toBeGreaterThanOrEqual(scoreBox.y + scoreBox.height - 1);
        }
        // The score and the rating chip each stay on one line.
        for (const selector of [".score-value", ".score-badge"]) {
          const lines = await preview(page)
            .locator(selector)
            .evaluate((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
            });
          expect(lines, selector).toBe(1);
        }
      };

      await expectFits();
      await addJobDescriptionButton(page).click();
      await jobDescriptionField(page).fill(`Data analyst ${LONG_TOKEN} SQL ${LONG_TOKEN}`);
      await expectFits();
    });
  });
}
