import {
  addJobDescriptionButton,
  chooseFixture,
  createFileDataTransfer,
  expect,
  expectNoHorizontalOverflow,
  fileInput,
  fixturePath,
  jobDescriptionField,
  loadingHeading,
  test,
  uploadHeading,
} from "./helpers/test.js";
import { replies, stubPuter } from "./helpers/puter.js";

const SOURCE_CODE_URL = "https://github.com/Ra-jj/AI-Resume-Analyzer";
const FONT_FILES = ["/fonts/anybody-latin.woff2", "/fonts/newsreader-latin.woff2"];

const HOW_IT_WORKS_STEPS = [
  {
    title: "Add a job description (optional)",
    text: "Paste the job posting to also get a match score and the keywords your resume is missing.",
  },
  {
    title: "Add your resume as a PDF",
    text: "Drag it onto the sheet above or choose a file. It needs selectable text (a scanned image won't work), up to 10 MB and 10 pages.",
  },
  {
    title: "Read your report",
    text: "A score out of 100, what to fix first, writing scores, resume and ATS checks. Copy a summary or save it as a PDF.",
  },
];

const PRIVACY_POINTS = [
  {
    lead: "Read on this page.",
    text: "Your PDF is opened in your browser to pull out its text. The file itself isn't uploaded.",
  },
  {
    lead: "Sent to an AI model.",
    text: "The text, and the job description if you add one, goes to an AI model through Puter.js to write the report. Puter may ask you to sign in.",
  },
  {
    lead: "Not kept by this app.",
    text: "There's no database, no analytics and no saved reports here.",
  },
];

const sampleButton = (page) => page.getByRole("button", { name: "See a full sample report" });
const sourceCodeLink = (page) =>
  page.getByRole("contentinfo").getByRole("link", { name: "Source code" });
const uploadSheet = (page) => page.locator(".dropzone-wrapper");

async function openHome(page) {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await expect(uploadHeading(page)).toBeVisible();
}

/**
 * The families Chrome really drew the element's own text with, read over
 * CDP. document.fonts.check() alone can't show this: it also returns true
 * for a family the page doesn't have at all.
 */
async function renderedFontFamilies(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  await cdp.detach();
  return fonts.map((font) => ({ name: font.postScriptName, isCustomFont: font.isCustomFont }));
}

test.describe("fonts", () => {
  test("the bundled Anybody and Newsreader are preloaded, downloaded once each and used", async ({ page }) => {
    const requestUrls = [];
    page.on("request", (request) => requestUrls.push(new URL(request.url())));
    await openHome(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle");

    const preloads = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) =>
        links.map((link) => ({
          path: new URL(link.href).pathname,
          type: link.type,
          crossOrigin: link.crossOrigin,
        })),
      );
    expect(preloads).toEqual(
      FONT_FILES.map((path) => ({ path, type: "font/woff2", crossOrigin: "anonymous" })),
    );
    // A preload that @font-face can't reuse is fetched a second time.
    for (const path of FONT_FILES) {
      expect(requestUrls.filter((url) => url.pathname === path), path).toHaveLength(1);
    }

    const fontState = await page.evaluate(() => ({
      checks: [
        document.fonts.check('850 96px "Anybody"'),
        document.fonts.check('700 17px "Anybody"'),
        document.fonts.check('400 18px "Newsreader"'),
        document.fonts.check('600 18px "Newsreader"'),
      ],
      faces: [...document.fonts].map((face) => ({
        family: face.family.replace(/"/g, ""),
        status: face.status,
        weight: face.weight,
        stretch: face.stretch,
        style: face.style,
      })),
    }));
    expect(fontState.checks).toEqual([true, true, true, true]);
    // Only upright faces exist: nothing on the page is set in italics.
    expect(fontState.faces).toEqual([
      { family: "Anybody", status: "loaded", weight: "500 900", stretch: "75% 150%", style: "normal" },
      { family: "Newsreader", status: "loaded", weight: "400 600", stretch: "normal", style: "normal" },
    ]);

    for (const [selector, family] of [
      [".home-title-line", "Anybody"],
      ["label.primary-btn", "Anybody"],
      [".upload-subtitle", "Newsreader"],
      [".privacy-note", "Newsreader"],
    ]) {
      const fonts = await renderedFontFamilies(page, selector);
      expect(fonts.length, selector).toBeGreaterThan(0);
      for (const font of fonts) {
        expect(font.isCustomFont, `${selector} uses a bundled font`).toBe(true);
        expect(font.name, `${selector} uses ${family}`).toMatch(new RegExp(`^${family}`));
      }
    }
  });

  test("nothing is requested from Google Fonts", async ({ page }) => {
    const fontHostRequests = [];
    page.on("request", (request) => {
      const { hostname } = new URL(request.url());
      if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(hostname)) {
        fontHostRequests.push(request.url());
      }
    });
    await openHome(page);
    await page.waitForLoadState("networkidle");

    expect(fontHostRequests).toEqual([]);
    await expect(
      page.locator('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]'),
    ).toHaveCount(0);
  });
});

test.describe("home page", () => {
  test("has one main landmark, headings in order and each section's copy", async ({ page }) => {
    await openHome(page);

    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveText("AI Resume Analyzer");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your resume, reviewed.");
    // h1, the sheet's h2, then each section's h2 and the steps' h3s: no level
    // is skipped.
    const headingLevels = await page
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName[1])));
    expect(headingLevels).toEqual([1, 2, 2, 3, 3, 3, 2]);

    await expect(page.locator(".upload-subtitle")).toHaveText(
      "Upload a PDF of your resume and get a score out of 100 and a list of what to fix first.",
    );
    await expect(uploadSheet(page).locator(".report-marks-list > li")).toHaveText([
      "A score out of 100/100",
      "Fix first",
      "Writing quality",
      "Resume and ATS checks",
      "Job match, with a job description",
    ]);

    const howItWorks = page.getByRole("region", { name: "How it works" });
    const steps = howItWorks.getByRole("listitem");
    await expect(steps).toHaveCount(HOW_IT_WORKS_STEPS.length);
    for (const [index, step] of HOW_IT_WORKS_STEPS.entries()) {
      await expect(steps.nth(index).locator(".how-step-number")).toHaveText(String(index + 1));
      await expect(steps.nth(index).getByRole("heading", { level: 3 })).toHaveText(step.title);
      await expect(steps.nth(index).locator("p")).toHaveText(step.text);
    }

    const privacySection = page.getByRole("region", { name: "What happens to your resume" });
    await expect(privacySection.locator("dt")).toHaveText(PRIVACY_POINTS.map((point) => point.lead));
    await expect(privacySection.locator("dd")).toHaveText(PRIVACY_POINTS.map((point) => point.text));

    await expect(page.getByRole("contentinfo")).toContainText(
      "AI Resume Analyzer. Built with React, pdf.js and Puter.js.",
    );
    await expect(sourceCodeLink(page)).toHaveAttribute("href", SOURCE_CODE_URL);
    await expect(sourceCodeLink(page)).toHaveAttribute("target", "_blank");
    await expect(sourceCodeLink(page)).toHaveAttribute("rel", "noopener noreferrer");

    // The e2e helpers find the upload button and the sheet by this text, so
    // nothing else on the page may contain it.
    await expect(page.getByText("Choose PDF File")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /upload your resume/i })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /analysis report/i })).toHaveCount(0);
  });

  test("Tab order: job description button, file input, sample button, source code link", async ({ page }) => {
    await openHome(page);
    const focusRingOf = (locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`;
      });
    const INK_RING = "solid 3px rgb(20, 22, 37)";

    // Nothing focusable comes before the job description button.
    await page.keyboard.press("Tab");
    await expect(addJobDescriptionButton(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(fileInput(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(sampleButton(page)).toBeFocused();
    expect(await focusRingOf(sampleButton(page))).toBe(INK_RING);
    await page.keyboard.press("Tab");
    await expect(sourceCodeLink(page)).toBeFocused();
    expect(await focusRingOf(sourceCodeLink(page))).toBe(INK_RING);

    await page.keyboard.press("Shift+Tab");
    await expect(sampleButton(page)).toBeFocused();
  });

  test("while a resume is analyzed, the sections below the sheet stay and the controls go", async ({ page }) => {
    await stubPuter(page, [replies.neverSettles()]);
    await page.goto("/");
    await chooseFixture(page, "resume.pdf");
    await expect(loadingHeading(page)).toBeVisible();

    await expect(page.locator(".loading-note")).toHaveText(
      "If a Puter sign-in window opens, finish signing in there to continue.",
    );
    await expect(page.getByRole("region", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("region", { name: "What happens to your resume" })).toBeVisible();
    await expect(sourceCodeLink(page)).toBeVisible();
    await expect(addJobDescriptionButton(page)).toHaveCount(0);
    await expect(page.locator(".privacy-note")).toHaveCount(0);
    await expect(sampleButton(page)).toHaveCount(0);
  });
});

test.describe("upload sheet", () => {
  for (const viewport of [
    { width: 1200, height: 800 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    test.describe(`at ${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });

      test("starts near the top of the first screen, with its button on screen", async ({ page }) => {
        await openHome(page);
        const sheetBox = await uploadSheet(page).boundingBox();
        // The plan puts its top at about y 110; the trusted-drag test drops
        // 24px below it.
        expect(sheetBox.y).toBeLessThanOrEqual(160);
        const buttonBox = await page.locator("label.primary-btn").boundingBox();
        expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(viewport.height);
      });

      test("keeps its size and place when the analysis starts", async ({ page }) => {
        await stubPuter(page, [replies.neverSettles()]);
        await page.goto("/");
        const before = await uploadSheet(page).boundingBox();

        await chooseFixture(page, "resume.pdf");
        await expect(loadingHeading(page)).toBeVisible();

        const after = await page.locator(".loading-sheet").boundingBox();
        expect(after).toEqual(before);
      });
    });
  }

  // Below 1200px the hero is one column, so the sheet is wide enough for
  // its controls beside the "In your report" column.
  for (const viewport of [
    { width: 960, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    test.describe(`at ${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });

      test("its button stays inside its column and its heading on one line", async ({ page }) => {
        await openHome(page);
        const columnBox = await page.locator(".dropzone-inner").boundingBox();
        const buttonBox = await page.locator("label.primary-btn").boundingBox();
        const BUTTON_SHADOW = 3;
        expect(buttonBox.x).toBeGreaterThanOrEqual(columnBox.x);
        expect(buttonBox.x + buttonBox.width + BUTTON_SHADOW).toBeLessThanOrEqual(
          columnBox.x + columnBox.width,
        );
        expect(buttonBox.y + buttonBox.height + BUTTON_SHADOW).toBeLessThanOrEqual(
          columnBox.y + columnBox.height,
        );
        const headingLines = await uploadHeading(page).evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        });
        expect(headingLines).toBe(1);
      });

      test("the loading sheet that replaces it is the same size", async ({ page }) => {
        await stubPuter(page, [replies.neverSettles()]);
        await page.goto("/");
        const dropzoneBox = await uploadSheet(page).boundingBox();

        await chooseFixture(page, "resume.pdf");
        await expect(loadingHeading(page)).toBeVisible();

        // The job description toggle is hidden while loading, so in one
        // column the sheet moves up; its size must not change.
        const loadingBox = await page.locator(".loading-sheet").boundingBox();
        expect([loadingBox.width, loadingBox.height]).toEqual([
          dropzoneBox.width,
          dropzoneBox.height,
        ]);
      });
    });
  }

  test("with forced colours, the outline appears only while a file is dragged over it", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openHome(page);
    const sheet = uploadSheet(page);
    const outlineOf = () =>
      sheet.evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });

    expect((await outlineOf()).style).toBe("none");

    const dataTransfer = await createFileDataTransfer(page, "resume.pdf");
    await sheet.dispatchEvent("dragenter", { dataTransfer });
    await expect(sheet).toHaveClass(/\bis-drag-active\b/);
    expect(await outlineOf()).toEqual({ style: "dashed", width: "2px" });
  });

  test("a dragged file highlights it without moving, resizing or rewording it", async ({ page }) => {
    await openHome(page);
    const sheet = uploadSheet(page);
    const snapshot = () =>
      sheet.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          box: [box.x, box.y, box.width, box.height],
          childBoxes: [...element.querySelectorAll("*")].map((child) => {
            const childBox = child.getBoundingClientRect();
            return [childBox.x, childBox.y, childBox.width, childBox.height];
          }),
          text: element.innerText,
          transform: style.transform,
          boxShadow: style.boxShadow,
        };
      });
    const before = await snapshot();

    const dataTransfer = await createFileDataTransfer(page, "resume.pdf");
    await sheet.dispatchEvent("dragenter", { dataTransfer });
    await expect(sheet).toHaveClass(/\bis-drag-active\b/);
    // Past the 0.15s colour transitions.
    await page.waitForTimeout(400);

    expect(await snapshot()).toEqual(before);
    expect(
      await sheet.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        };
      }),
    ).toEqual({
      // --highlighter-pale, with a dashed ink outline drawn inside the frame
      background: "rgb(255, 244, 176)",
      outline: "dashed 2px rgb(20, 22, 37)",
    });
  });

  test("a trusted drag held still just inside each edge keeps the highlight steady", async ({ page }) => {
    await openHome(page);
    const sheet = uploadSheet(page);
    // Counts every time the highlight turns on or off.
    await sheet.evaluate((element) => {
      window.__dragHighlightChanges = 0;
      let isActive = element.classList.contains("is-drag-active");
      new MutationObserver(() => {
        const nowActive = element.classList.contains("is-drag-active");
        if (nowActive !== isActive) {
          isActive = nowActive;
          window.__dragHighlightChanges += 1;
        }
      }).observe(element, { attributes: true, attributeFilter: ["class"] });
    });
    const cdp = await page.context().newCDPSession(page);
    const data = { items: [], files: [fixturePath("resume.pdf")], dragOperationsMask: 1 };
    const box = await sheet.boundingBox();
    const inset = 3;
    const middleX = box.x + box.width / 2;
    const middleY = box.y + box.height / 2;
    const edgePoints = [
      { x: middleX, y: box.y + inset },
      { x: box.x + box.width - inset, y: middleY },
      { x: middleX, y: box.y + box.height - inset },
      { x: box.x + inset, y: middleY },
    ];

    await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", ...edgePoints[0], data });
    for (const point of edgePoints) {
      // Held still for about half a second: if the sheet moved under the
      // pointer, the drag would leave and re-enter it.
      for (let step = 0; step < 12; step++) {
        await cdp.send("Input.dispatchDragEvent", { type: "dragOver", ...point, data });
        await page.waitForTimeout(40);
      }
    }

    await expect(sheet).toHaveClass(/\bis-drag-active\b/);
    expect(await page.evaluate(() => window.__dragHighlightChanges)).toBe(1);
    await cdp.send("Input.dispatchDragEvent", { type: "dragCancel", ...edgePoints[0], data });
  });
});

for (const width of [390, 360, 320]) {
  test.describe(`home page at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("every section fits the screen, the sheet's shadow included", async ({ page }) => {
      await openHome(page);

      for (const selector of [
        ".site-header",
        ".home-title",
        ".upload-subtitle",
        ".jd-add-btn",
        ".how-it-works",
        ".how-steps",
        ".sample-open-btn",
        ".privacy-section",
        ".site-footer",
      ]) {
        const box = await page.locator(selector).boundingBox();
        expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(width);
      }
      const sheetBox = await uploadSheet(page).boundingBox();
      // "rgb(20, 22, 37) 6px 6px 0px 0px": the horizontal offset.
      const shadowOffset = await uploadSheet(page).evaluate(
        (element) => parseFloat(getComputedStyle(element).boxShadow.split(" ").at(-4)),
      );
      expect(shadowOffset).toBe(6);
      expect(sheetBox.x + sheetBox.width + shadowOffset).toBeLessThanOrEqual(width);
      await expectNoHorizontalOverflow(page, width);
    });

    test("the headline keeps to two lines", async ({ page }) => {
      await openHome(page);
      const lineCount = await page.locator(".home-title").evaluate((element) => {
        const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
        return Math.round(element.getBoundingClientRect().height / lineHeight);
      });
      expect(lineCount).toBe(2);
    });

    test("job description open with its error, and an upload error, fit the screen", async ({ page }) => {
      await openHome(page);
      await addJobDescriptionButton(page).click();
      await jobDescriptionField(page).fill("Backend engineer, Go");
      await chooseFixture(page, "resume.pdf");
      await expect(page.locator(".jd-error")).toBeVisible();
      await expectNoHorizontalOverflow(page, width);

      await page.getByRole("button", { name: "Clear job description" }).click();
      await fileInput(page).setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not a pdf"),
      });
      await expect(page.getByRole("alert")).toBeVisible();
      await expectNoHorizontalOverflow(page, width);
    });

    test("the error fallback fits the screen, its longest button label on one line", async ({ page }) => {
      await openHome(page);
      // 15,000 is formatted only by the report's truncation notice, so the
      // long resume's report fails to render (see errors.spec.js).
      await page.evaluate(() => {
        const original = Number.prototype.toLocaleString;
        Number.prototype.toLocaleString = function toLocaleString(...args) {
          if (Number(this) === 15_000) throw new Error("e2e: forced render failure");
          return original.apply(this, args);
        };
      });
      await chooseFixture(page, "long-resume.pdf");
      const button = page
        .getByRole("alert")
        .getByRole("button", { name: "Analyze another resume" });
      await expect(button).toBeVisible();
      await expectNoHorizontalOverflow(page, width);
      expect(
        await button.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        }),
      ).toBe(1);
    });
  });
}
