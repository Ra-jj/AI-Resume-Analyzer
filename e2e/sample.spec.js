import { buildReportSummaryText } from "../src/lib/reportText.js";
import { getSampleReport } from "../src/lib/sampleReport.js";
import {
  chooseFixture,
  dashboardHeading,
  expect,
  expectNoHorizontalOverflow,
  fileInput,
  isPdfLibraryUrl,
  isPdfWorkerUrl,
  loadingHeading,
  test,
  uploadHeading,
} from "./helpers/test.js";
import { getPuterCalls, releaseHeldReply, replies, stubPuter } from "./helpers/puter.js";

const SAMPLE_BANNER = "Sample report: fictional resume";

const sampleButton = (page) => page.getByRole("button", { name: "See a full sample report" });
const sampleHeading = (page) =>
  page.getByRole("heading", { level: 1, name: "Sample analysis report" });
const backToHomeButton = (page) => page.getByRole("button", { name: "Back to home" });
const startOwnButton = (page) => page.getByRole("button", { name: "Analyze your own resume" });

/**
 * Records every pdf.js (library chunk or worker) and Puter request the page
 * makes from now on.
 */
function trackRequests(page) {
  const requests = { pdf: [], puter: [] };
  page.on("request", (request) => {
    const url = request.url();
    if (isPdfLibraryUrl(url) || isPdfWorkerUrl(url)) requests.pdf.push(url);
    if (/(^|\.)puter\.com$/.test(new URL(url).hostname)) requests.puter.push(url);
  });
  return requests;
}

/** Loads the home page and waits until its own requests (Puter's script) are done. */
async function openHome(page) {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await expect(uploadHeading(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("the sample journey shows the fictional report and never loads pdf.js or calls Puter", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await openHome(page);
  const requests = trackRequests(page);

  await sampleButton(page).hover();
  await sampleButton(page).click();

  // The report opens like a real one: at its top, focus on its heading.
  await expect(sampleHeading(page)).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText(SAMPLE_BANNER)).toBeVisible();
  await expect(page.getByText("72", { exact: true })).toBeVisible();
  await expect(page.getByText("Good", { exact: true })).toBeVisible();
  await expect(page.getByText("64%", { exact: true })).toBeVisible();
  await expect(page.getByText("Upload a PDF to get this report for your resume.")).toBeVisible();

  // The banner is plain text. The page's only status region lives on the
  // upload screen, and the sample has no alert.
  expect(
    await page
      .getByText(SAMPLE_BANNER)
      .evaluate((element) => element.closest('[role="status"], [role="alert"], [aria-live]')),
  ).toBeNull();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /analysis report/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Analyze another resume" })).toHaveCount(0);

  // Copy summary marks the text as a sample.
  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(page.getByText("Summary copied")).toBeVisible();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(
    `Sample report (fictional resume)\n\n${buildReportSummaryText(getSampleReport())}`,
  );

  // Every control in the sample, by keyboard and by pointer.
  for (const button of [
    backToHomeButton(page),
    page.getByRole("button", { name: "Copy summary" }),
    page.getByRole("button", { name: "Print or save as PDF" }),
    startOwnButton(page),
  ]) {
    await button.focus();
    await button.hover();
  }
  await page.getByRole("button", { name: "Print or save as PDF" }).click();

  // Back to home: focus returns to the button that opened the sample.
  await backToHomeButton(page).click();
  await expect(uploadHeading(page)).toBeVisible();
  await expect(sampleButton(page)).toBeFocused();

  // Open it again from the keyboard.
  await page.keyboard.press("Enter");
  await expect(sampleHeading(page)).toBeFocused();
  await page.waitForLoadState("networkidle");

  expect(requests.pdf).toEqual([]);
  expect(requests.puter).toEqual([]);
  expect(await getPuterCalls(page)).toEqual([]);
});

test("Analyze your own resume opens the upload screen at its top with focus on the file input", async ({
  page,
}) => {
  await openHome(page);
  await sampleButton(page).click();
  await expect(sampleHeading(page)).toBeFocused();

  // The button ends the long report; clicking it scrolls the page down.
  await startOwnButton(page).click();

  await expect(uploadHeading(page)).toBeVisible();
  await expect(fileInput(page)).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(sampleButton(page)).toBeVisible();
});

test("an upload error is cleared by a visit to the sample", async ({ page }) => {
  await openHome(page);
  await fileInput(page).setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("alert")).toBeVisible();

  await sampleButton(page).click();
  await expect(sampleHeading(page)).toBeFocused();
  await backToHomeButton(page).click();

  await expect(sampleButton(page)).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("the sample button is hidden while a resume is analyzed", async ({ page }) => {
  await stubPuter(page, [replies.heldAnalysis()]);
  await page.goto("/");
  await expect(sampleButton(page)).toBeVisible();

  await chooseFixture(page, "resume.pdf");
  await expect(loadingHeading(page)).toBeVisible();
  await expect(sampleButton(page)).toHaveCount(0);

  await releaseHeldReply(page);
  await expect(dashboardHeading(page)).toBeFocused();
  await page.getByRole("button", { name: "Analyze another resume" }).click();
  await expect(fileInput(page)).toBeFocused();
  await expect(sampleButton(page)).toBeVisible();
});

for (const width of [390, 360, 320]) {
  test.describe(`sample report at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("fits the screen", async ({ page }) => {
      await openHome(page);
      await expectNoHorizontalOverflow(page, width);
      await sampleButton(page).click();
      await expect(sampleHeading(page)).toBeFocused();
      await expect(page.getByText(SAMPLE_BANNER)).toBeVisible();
      await expectNoHorizontalOverflow(page, width);
      await startOwnButton(page).scrollIntoViewIfNeeded();
      await expectNoHorizontalOverflow(page, width);
    });
  });
}

for (const { reducedMotion, expectedAnimations } of [
  { reducedMotion: "no-preference", expectedAnimations: ["slide-up"] },
  { reducedMotion: "reduce", expectedAnimations: [] },
]) {
  test(`the sample report with prefers-reduced-motion: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openHome(page);
    await sampleButton(page).click();
    await expect(sampleHeading(page)).toBeFocused();

    const animationNames = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSAnimation)
        .map((animation) => animation.animationName),
    );
    expect(animationNames).toEqual(expectedAnimations);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}
