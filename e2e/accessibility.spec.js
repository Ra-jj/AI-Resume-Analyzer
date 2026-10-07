import {
  addJobDescriptionButton,
  analysisStatus,
  chooseFixture,
  dashboardHeading,
  expect,
  fileInput,
  isPdfWorkerUrl,
  jobDescriptionField,
  test,
  uploadHeading,
} from "./helpers/test.js";
import { releaseHeldReply, replies, stubPuter } from "./helpers/puter.js";

// --primary-light, the colour of every keyboard focus ring.
const FOCUS_RING = { style: "solid", width: "2px", color: "rgb(52, 211, 153)" };
const NO_RING = { style: "none" };

const STEP_LABELS = ["Reading your PDF", "Analyzing with AI", "Building your report"];

const JOB_DESCRIPTION =
  "Senior Backend Engineer, Payments Platform. We are looking for an engineer with 5+ years of Go or Rust, Kubernetes and PostgreSQL.";

function outlineOf(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle === "none"
      ? { style: "none" }
      : { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
}

/**
 * Holds every request for the pdf.js worker until release() is called, so
 * the analysis stays on the "Reading your PDF" step.
 */
async function holdPdfWorker(page) {
  const heldRoutes = [];
  await page.route(
    (url) => isPdfWorkerUrl(url.href),
    (route) => {
      heldRoutes.push(route);
    },
  );
  return {
    async release() {
      await expect.poll(() => heldRoutes.length).toBeGreaterThan(0);
      await page.unroute((url) => isPdfWorkerUrl(url.href));
      await Promise.all(heldRoutes.splice(0).map((route) => route.continue()));
    },
  };
}

/**
 * Records, in order, the text of the page's live regions each time the DOM
 * inside one changes: what a screen reader would be told.
 */
async function recordLiveRegionChanges(page) {
  await page.addInitScript(() => {
    const LIVE_REGION = '[role="status"], [role="alert"], [aria-live]';
    window.__liveRegionChanges = [];
    new MutationObserver((mutations) => {
      const changedRegions = new Set();
      for (const mutation of mutations) {
        const target =
          mutation.target.nodeType === Node.ELEMENT_NODE
            ? mutation.target
            : mutation.target.parentElement;
        const region = target?.closest(LIVE_REGION);
        if (region) changedRegions.add(region);
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches(LIVE_REGION)) changedRegions.add(node);
          for (const inner of node.querySelectorAll(LIVE_REGION)) changedRegions.add(inner);
        }
      }
      for (const region of changedRegions) {
        if (region.isConnected && region.textContent) {
          window.__liveRegionChanges.push(region.textContent);
        }
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  return () => page.evaluate(() => window.__liveRegionChanges);
}

const progressSteps = (page) => page.locator(".progress-steps > li");

async function expectCurrentStep(page, currentIndex) {
  const steps = progressSteps(page);
  await expect(steps).toHaveCount(STEP_LABELS.length);
  for (let index = 0; index < STEP_LABELS.length; index++) {
    const step = steps.nth(index);
    if (index === currentIndex) {
      await expect(step).toHaveAttribute("aria-current", "step");
      await expect(step).toHaveText(STEP_LABELS[index]);
    } else {
      await expect(step).not.toHaveAttribute("aria-current");
      // Finished steps say so to screen readers, as well as with a tick.
      await expect(step).toHaveText(
        index < currentIndex ? `Done: ${STEP_LABELS[index]}` : STEP_LABELS[index],
      );
      await expect(step).toHaveClass(
        index < currentIndex ? /progress-step--done/ : /progress-step--upcoming/,
      );
    }
  }
}

test.describe("progress steps", () => {
  test("show reading, then analyzing, and announce each step once", async ({ page }) => {
    const liveRegionChanges = await recordLiveRegionChanges(page);
    await stubPuter(page, [replies.heldAnalysis()]);
    const worker = await holdPdfWorker(page);
    await page.goto("/");

    // At rest the status line is already in the page, empty, and nothing has
    // been announced. Some screen readers skip a live region that appears
    // with its text already inside, so the same element must carry the
    // first step.
    const status = analysisStatus(page);
    await expect(uploadHeading(page)).toBeVisible();
    await expect(status).toBeEmpty();
    expect(await liveRegionChanges()).toEqual([]);
    await status.evaluate((element) => {
      element.__e2eInPageBeforeLoading = true;
    });

    await chooseFixture(page, "resume.pdf");

    await expect(status).toHaveText("Reading your PDF, step 1 of 3");
    expect(await status.evaluate((element) => element.__e2eInPageBeforeLoading)).toBe(true);
    await expectCurrentStep(page, 0);
    // One live region on the loading screen, so nothing is announced twice.
    await expect(
      page.locator('[role="status"], [role="alert"], [aria-live]'),
    ).toHaveCount(1);

    await worker.release();
    await expect(status).toHaveText("Analyzing with AI, step 2 of 3");
    await expectCurrentStep(page, 1);

    await releaseHeldReply(page);
    await expect(dashboardHeading(page)).toBeVisible();

    expect(await liveRegionChanges()).toEqual([
      "Reading your PDF, step 1 of 3",
      "Analyzing with AI, step 2 of 3",
    ]);
  });

  test("stay on Analyzing with AI while an unreadable reply is asked for again", async ({ page }) => {
    await stubPuter(page, [replies.text("Not JSON"), replies.heldAnalysis()]);
    await page.goto("/");

    await chooseFixture(page, "resume.pdf");

    await expect.poll(() => page.evaluate(() => window.__puterCalls.length)).toBe(2);
    await expect(analysisStatus(page)).toHaveText("Analyzing with AI, step 2 of 3");
    await expectCurrentStep(page, 1);
    await releaseHeldReply(page);
    await expect(dashboardHeading(page)).toBeVisible();
  });
});

test.describe("focus", () => {
  test("is not moved when the page loads", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");
    await expect(uploadHeading(page)).toBeVisible();

    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test("moves to the report heading when the report opens, and Tab continues from there", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");

    await chooseFixture(page, "resume.pdf");

    const heading = dashboardHeading(page);
    await expect(heading).toBeFocused();
    expect(await heading.evaluate((element) => element.tagName)).toBe("H1");
    // Focus from script only: no ring on the heading.
    expect(await outlineOf(heading)).toEqual(NO_RING);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Copy summary" })).toBeFocused();
  });

  test.describe("on a short phone screen", () => {
    test.use({ viewport: { width: 390, height: 600 } });

    test("the report opens at its top even when the upload screen was scrolled down", async ({ page }) => {
      await stubPuter(page, [replies.heldAnalysis()]);
      await page.goto("/");
      await addJobDescriptionButton(page).click();
      await jobDescriptionField(page).fill(JOB_DESCRIPTION);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

      await chooseFixture(page, "resume.pdf");
      await releaseHeldReply(page);

      await expect(dashboardHeading(page)).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  });

  test("moves to the file input after Analyze another resume, by mouse or keyboard", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");
    await chooseFixture(page, "resume.pdf");
    await expect(dashboardHeading(page)).toBeFocused();

    // Mouse: focus moves, without a ring.
    await page.getByRole("button", { name: "Analyze another resume" }).click();
    await expect(fileInput(page)).toBeFocused();
    expect(await outlineOf(page.locator("label.gradient-btn"))).toEqual(NO_RING);

    // Keyboard: focus moves, with the ring on the button around the input.
    await chooseFixture(page, "resume.pdf");
    await expect(dashboardHeading(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Analyze another resume" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(fileInput(page)).toBeFocused();
    expect(await outlineOf(page.locator("label.gradient-btn"))).toEqual(FOCUS_RING);
  });

  test("after Analyze another resume, typing in the job description keeps focus there", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");
    await addJobDescriptionButton(page).click();
    await jobDescriptionField(page).fill(JOB_DESCRIPTION);
    await chooseFixture(page, "resume.pdf");
    await page.getByRole("button", { name: "Analyze another resume" }).click();
    await expect(fileInput(page)).toBeFocused();

    // Each keystroke re-renders the upload screen; none may pull focus back
    // to the file input.
    await jobDescriptionField(page).click();
    await page.keyboard.type(" Remote.");

    await expect(jobDescriptionField(page)).toBeFocused();
    await expect(jobDescriptionField(page)).toHaveValue(`${JOB_DESCRIPTION} Remote.`);
  });
});

test.describe("keyboard focus rings", () => {
  test("every control on the report shows the ring for keyboard focus, none for a click", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {};
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      });
    });
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");
    await chooseFixture(page, "resume.pdf");
    await expect(dashboardHeading(page)).toBeFocused();

    const backButton = page.getByRole("button", { name: "Analyze another resume" });
    const copyButton = page.getByRole("button", { name: "Copy summary" });
    const printButton = page.getByRole("button", { name: "Print or save as PDF" });

    await page.keyboard.press("Shift+Tab");
    await expect(backButton).toBeFocused();
    expect(await outlineOf(backButton)).toEqual(FOCUS_RING);
    // The heading (tabIndex -1) is skipped by Tab.
    await page.keyboard.press("Tab");
    await expect(copyButton).toBeFocused();
    expect(await outlineOf(copyButton)).toEqual(FOCUS_RING);
    await page.keyboard.press("Tab");
    await expect(printButton).toBeFocused();
    expect(await outlineOf(printButton)).toEqual(FOCUS_RING);

    await copyButton.click();
    await expect(copyButton).toBeFocused();
    expect(await outlineOf(copyButton)).toEqual(NO_RING);
    await printButton.click();
    await expect(printButton).toBeFocused();
    expect(await outlineOf(printButton)).toEqual(NO_RING);
  });

  test("the job description buttons show the ring for keyboard focus, none for a click", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(addJobDescriptionButton(page)).toBeFocused();
    expect(await outlineOf(addJobDescriptionButton(page))).toEqual(FOCUS_RING);
    await page.keyboard.press("Enter");
    await expect(jobDescriptionField(page)).toBeFocused();

    const clearButton = page.getByRole("button", { name: "Clear job description" });
    await page.keyboard.press("Shift+Tab");
    await expect(clearButton).toBeFocused();
    expect(await outlineOf(clearButton)).toEqual(FOCUS_RING);

    await clearButton.click();
    await addJobDescriptionButton(page).click();
    await page.getByRole("button", { name: "Clear job description" }).click();
    await expect(addJobDescriptionButton(page)).toBeFocused();
    expect(await outlineOf(addJobDescriptionButton(page))).toEqual(NO_RING);
  });

  test("the report fallback's button shows the ring for keyboard focus", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");
    // 15,000 is formatted only by the dashboard's truncation notice, so this
    // makes the report fail to render (see errors.spec.js).
    await page.evaluate(() => {
      const original = Number.prototype.toLocaleString;
      Number.prototype.toLocaleString = function toLocaleString(...args) {
        if (Number(this) === 15_000) throw new Error("e2e: forced render failure");
        return original.apply(this, args);
      };
    });
    await chooseFixture(page, "long-resume.pdf");
    const fallbackButton = page
      .getByRole("alert")
      .getByRole("button", { name: "Analyze another resume" });
    await expect(fallbackButton).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(fallbackButton).toBeFocused();
    expect(await outlineOf(fallbackButton)).toEqual(FOCUS_RING);
  });
});

test.describe("reduced motion", () => {
  const transformOf = (locator) =>
    locator.evaluate((element) => getComputedStyle(element).transform);

  /**
   * Hovers the element and checks its transform once any transition has had
   * time to finish. "none" is checked after the 0.3s hover transitions would
   * have ended, so a lift that is merely slow can't pass for no lift.
   */
  async function expectTransformWhileHovered(page, locator, expectedTransform) {
    await locator.hover();
    if (expectedTransform === "none") {
      await page.waitForTimeout(500);
      expect(await transformOf(locator)).toBe("none");
    } else {
      await expect.poll(() => transformOf(locator)).toBe(expectedTransform);
    }
  }

  const animationOf = (locator) =>
    locator.evaluate((element) => getComputedStyle(element).animationName);

  for (const { reducedMotion, expected } of [
    {
      reducedMotion: "no-preference",
      expected: {
        dropzoneHover: "matrix(1, 0, 0, 1, 0, -5)",
        buttonHover: "matrix(1.02, 0, 0, 1.02, 0, 0)",
        loader: "slide-up",
        spinner: "spin",
        dashboard: "slide-up",
        scoreBarTransition: "1s",
      },
    },
    {
      reducedMotion: "reduce",
      expected: {
        dropzoneHover: "none",
        buttonHover: "none",
        loader: "none",
        spinner: "fade-pulse",
        dashboard: "none",
        scoreBarTransition: "0s",
      },
    },
  ]) {
    test(`with prefers-reduced-motion: ${reducedMotion}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await stubPuter(page, [replies.heldAnalysis()]);
      await page.goto("/");

      await expectTransformWhileHovered(
        page,
        page.locator(".dropzone-wrapper"),
        expected.dropzoneHover,
      );
      await expectTransformWhileHovered(
        page,
        page.locator("label.gradient-btn"),
        expected.buttonHover,
      );

      await chooseFixture(page, "resume.pdf");
      await expect(page.locator(".loading-container")).toBeVisible();
      expect(await animationOf(page.locator(".loading-container"))).toBe(expected.loader);
      expect(await animationOf(page.locator(".spinner-ring"))).toBe(expected.spinner);
      // The spinner never rotates under reduced motion.
      if (reducedMotion === "reduce") {
        await page.waitForTimeout(300);
        expect(await transformOf(page.locator(".spinner-ring"))).toBe("none");
      }

      await releaseHeldReply(page);
      await expect(dashboardHeading(page)).toBeVisible();
      expect(await animationOf(page.locator(".dashboard-container"))).toBe(expected.dashboard);
      expect(
        await page
          .locator(".score-bar-fill")
          .evaluate((element) => getComputedStyle(element).transitionDuration),
      ).toBe(expected.scoreBarTransition);
    });
  }
});
