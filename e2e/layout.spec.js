import {
  addJobDescriptionButton,
  analysisStatus,
  chooseFixture,
  dashboardHeading,
  expect,
  expectNoHorizontalOverflow,
  fileInput,
  isPdfWorkerUrl,
  jobDescriptionField,
  loadingHeading,
  test,
} from "./helpers/test.js";
import {
  makeAnalysis,
  makeJobMatch,
  releaseHeldReply,
  replies,
  stubPuter,
} from "./helpers/puter.js";

const PHONE_WIDTH = 390;
test.use({ viewport: { width: PHONE_WIDTH, height: 844 } });

// Strings wider than a phone screen with no break opportunity in them (no
// spaces or hyphens), as an AI reply or a pasted posting can contain.
const LONG_TOKEN = "KubernetesOperatorLifecycleManagementAndCustomResourceDefinitions";
const LONG_URL =
  "https://careers.example.com/jobs/seniorbackendengineerpaymentsplatformremotefirsteuropeandamericas";

const longTokenAnalysis = makeAnalysis({
  executiveSummary: `Strong backend profile; see ${LONG_URL} for the matching role.`,
  topStrengths: [LONG_TOKEN, "Clear impact metrics"],
  mainImprovements: [`Spell out ${LONG_TOKEN}`, "Shorten the summary"],
  performanceMetrics: [
    { name: "Impact & Quantifiable Results", score: 88 },
    { name: LONG_TOKEN, score: 100 },
  ],
  resumeInsights: [LONG_URL],
  atsCompatibilityChecklist: [
    { item: "Standard Section Headers", passed: true },
    { item: LONG_TOKEN, passed: false },
  ],
  recommendedKeywords: [LONG_TOKEN, "gRPC", LONG_URL],
  recommendedRoles: [LONG_TOKEN, "Staff Engineer"],
  jobMatch: makeJobMatch({
    summary: `Matches most of ${LONG_URL}.`,
    matchedKeywords: [LONG_TOKEN, "Go"],
    missingKeywords: [LONG_URL, "Rust"],
  }),
});

const LONG_JOB_DESCRIPTION = `Senior Backend Engineer ${LONG_URL} ${LONG_TOKEN} `.repeat(4);

test(`upload screen fits ${PHONE_WIDTH}px`, async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await expect(addJobDescriptionButton(page)).toBeVisible();
  await expectNoHorizontalOverflow(page, PHONE_WIDTH);
});

test(`open job description, with long text and its error, fits ${PHONE_WIDTH}px`, async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();
  await jobDescriptionField(page).fill(LONG_JOB_DESCRIPTION);
  await expectNoHorizontalOverflow(page, PHONE_WIDTH);

  await jobDescriptionField(page).fill(LONG_TOKEN);
  await chooseFixture(page, "resume.pdf");
  await expect(page.locator(".jd-error")).toBeVisible();
  await expectNoHorizontalOverflow(page, PHONE_WIDTH);
});

test(`loading screen fits ${PHONE_WIDTH}px`, async ({ page }) => {
  await stubPuter(page, [replies.neverSettles()]);
  await page.goto("/");
  await chooseFixture(page, "resume.pdf");
  await expect(loadingHeading(page)).toBeVisible();
  await expect(analysisStatus(page)).toHaveText("Analyzing with AI, step 2 of 3");
  await expectNoHorizontalOverflow(page, PHONE_WIDTH);
});

test(`error messages fit ${PHONE_WIDTH}px`, async ({ page }) => {
  // No Puter stub, so the longest message (AI_UNAVAILABLE) is shown.
  await page.goto("/");
  await chooseFixture(page, "resume.pdf");
  await expect(page.getByRole("alert")).toContainText("js.puter.com");
  await expectNoHorizontalOverflow(page, PHONE_WIDTH);
});

test(`dashboard with a job match and long tokens fits ${PHONE_WIDTH}px`, async ({ page }) => {
  await stubPuter(page, [replies.analysis(longTokenAnalysis)]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();
  await jobDescriptionField(page).fill(LONG_JOB_DESCRIPTION);
  // The long fixture also shows the truncation notice.
  await chooseFixture(page, "long-resume.pdf");

  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job Match" })).toBeVisible();
  await expect(page.locator(".truncation-notice")).toBeVisible();
  await expect(page.getByText(LONG_TOKEN).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, PHONE_WIDTH);
});

test.describe("on a short phone screen", () => {
  test.use({ viewport: { width: PHONE_WIDTH, height: 560 } });

  test("an error under the dropzone is scrolled into view", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");

    await fileInput(page).setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a pdf"),
    });

    await expect(page.getByRole("alert")).toBeInViewport();
  });
});

const PRIVACY_NOTE =
  "Your resume's text (and the job description, if you add one) is sent to an AI model through Puter.js to create your report. This app doesn't store it.";

/** How many lines the element's text is laid out on. */
function lineCountOf(locator) {
  return locator.evaluate((element) => {
    const lineTops = new Set();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0) lineTops.add(Math.round(rect.top));
      }
    }
    return lineTops.size;
  });
}

function expectInside(innerBox, outerBox, what) {
  expect(innerBox.x, `${what} left edge`).toBeGreaterThanOrEqual(outerBox.x);
  expect(innerBox.x + innerBox.width, `${what} right edge`).toBeLessThanOrEqual(
    outerBox.x + outerBox.width,
  );
}

function boxesOverlap(first, second) {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

for (const width of [390, 360, 320]) {
  test.describe(`phone layout at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("upload screen: privacy note, and a one-line upload button", async ({ page }) => {
      await stubPuter(page, [replies.analysis()]);
      await page.goto("/");

      await expect(page.locator(".privacy-note")).toHaveText(PRIVACY_NOTE);
      await expect(page.locator(".privacy-note")).toBeVisible();
      const uploadButton = page.locator("label.gradient-btn");
      expect(await lineCountOf(uploadButton)).toBe(1);
      expectInside(
        await uploadButton.boundingBox(),
        await page.locator(".dropzone-inner").boundingBox(),
        "the upload button inside the dropzone",
      );
      await expectNoHorizontalOverflow(page, width);
    });

    test("loading screen, at each step", async ({ page }) => {
      await stubPuter(page, [replies.heldAnalysis()]);
      const heldWorkerRoutes = [];
      await page.route(
        (url) => isPdfWorkerUrl(url.href),
        (route) => {
          heldWorkerRoutes.push(route);
        },
      );
      await page.goto("/");
      await chooseFixture(page, "resume.pdf");

      await expect(analysisStatus(page)).toHaveText("Reading your PDF, step 1 of 3");
      await expect(page.locator(".privacy-note")).toHaveCount(0);
      await expectNoHorizontalOverflow(page, width);

      await expect.poll(() => heldWorkerRoutes.length).toBeGreaterThan(0);
      await page.unroute((url) => isPdfWorkerUrl(url.href));
      await Promise.all(heldWorkerRoutes.map((route) => route.continue()));
      await expect(analysisStatus(page)).toHaveText("Analyzing with AI, step 2 of 3");
      await expectNoHorizontalOverflow(page, width);

      await releaseHeldReply(page);
      await expect(dashboardHeading(page)).toBeVisible();
    });

    test("report header: one-line labels that don't overlap", async ({ page }) => {
      // No clipboard API, so Copy shows its (long) error message.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      });
      await stubPuter(page, [replies.analysis(makeAnalysis({ jobMatch: makeJobMatch() }))]);
      await page.goto("/");
      await chooseFixture(page, "resume.pdf");
      await expect(dashboardHeading(page)).toBeVisible();

      const backButton = page.getByRole("button", { name: "Analyze another resume" });
      const copyButton = page.getByRole("button", { name: "Copy summary" });
      const printButton = page.getByRole("button", { name: "Print or save as PDF" });
      const headerControls = [backButton, dashboardHeading(page), copyButton, printButton];
      const headerBox = await page.locator(".dashboard-header").boundingBox();
      const boxes = [];
      for (const locator of headerControls) {
        expect(await lineCountOf(locator)).toBe(1);
        const box = await locator.boundingBox();
        expectInside(box, headerBox, `${await locator.innerText()} inside the header`);
        boxes.push(box);
      }
      for (let first = 0; first < boxes.length; first++) {
        for (let second = first + 1; second < boxes.length; second++) {
          expect(boxesOverlap(boxes[first], boxes[second])).toBe(false);
        }
      }
      await expectNoHorizontalOverflow(page, width);

      await copyButton.click();
      await expect(page.locator(".report-action-feedback")).toContainText("Couldn't copy the summary");
      await expectNoHorizontalOverflow(page, width);
    });
  });
}

// Mouse hover versus a tap: the report buttons' hover background is only for
// screens that can really hover, so it doesn't stick after a tap on a phone.
for (const { title, contextOptions, interact, expectedBackground } of [
  {
    title: "with a mouse, hovering highlights a report button",
    contextOptions: {},
    interact: (button) => button.hover(),
    // --border-glow
    expectedBackground: "rgba(16, 185, 129, 0.15)",
  },
  {
    title: "on a touch screen, a tapped report button isn't left highlighted",
    contextOptions: { hasTouch: true, isMobile: true },
    interact: (button) => button.tap(),
    expectedBackground: "rgba(0, 0, 0, 0)",
  },
]) {
  test.describe(title, () => {
    test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, ...contextOptions });

    test("Copy summary background", async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: () => Promise.resolve() },
        });
      });
      await stubPuter(page, [replies.analysis()]);
      await page.goto("/");
      await chooseFixture(page, "resume.pdf");
      await expect(dashboardHeading(page)).toBeVisible();
      const copyButton = page.getByRole("button", { name: "Copy summary" });

      await interact(copyButton);

      // The background transition takes 0.2s.
      await expect
        .poll(() => copyButton.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(expectedBackground);
      await page.waitForTimeout(300);
      expect(
        await copyButton.evaluate((element) => getComputedStyle(element).backgroundColor),
      ).toBe(expectedBackground);
    });
  });
}
