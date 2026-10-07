import { AnalysisError } from "../src/lib/errors.js";
import { AI_TIMEOUT_MS, MAX_FILE_SIZE_BYTES, PDF_TIMEOUT_MS } from "../src/lib/limits.js";
import {
  addJobDescriptionButton,
  analysisStatus,
  chooseFixture,
  dashboardHeading,
  expect,
  fileInput,
  isPdfLibraryUrl,
  isPdfWorkerUrl,
  jobDescriptionField,
  loadingHeading,
  test,
  uploadHeading,
} from "./helpers/test.js";
import {
  getPuterCalls,
  makeAnalysis,
  releaseHeldReply,
  replies,
  stubPuter,
} from "./helpers/puter.js";

const messageFor = (code, details) => new AnalysisError(code, { details }).message;

/** The general error card under the dropzone. */
const errorCard = (page) => page.getByRole("alert");

test.describe("files rejected before reading", () => {
  test("INVALID_TYPE: a file that isn't a PDF", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");

    await fileInput(page).setInputFiles({
      name: "resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("not a pdf"),
    });

    await expect(errorCard(page)).toHaveText(messageFor("INVALID_TYPE"));
    await expect(fileInput(page)).toHaveValue("");
    expect(await getPuterCalls(page)).toEqual([]);
  });

  test("TOO_LARGE: a PDF over 10 MB", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");

    await fileInput(page).setInputFiles({
      name: "huge-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1),
    });

    await expect(errorCard(page)).toHaveText(messageFor("TOO_LARGE"));
    expect(await getPuterCalls(page)).toEqual([]);
  });

  test("AI_UNAVAILABLE: the Puter script didn't load", async ({ page }) => {
    // No stubPuter(): the request for js.puter.com is aborted, as an ad
    // blocker would.
    await page.goto("/");

    await chooseFixture(page, "resume.pdf");

    await expect(errorCard(page)).toHaveText(messageFor("AI_UNAVAILABLE"));
    await expect(uploadHeading(page)).toBeVisible();
  });
});

test.describe("PDFs that can't be analyzed", () => {
  const cases = [
    { code: "TOO_MANY_PAGES", fixture: "eleven-pages.pdf", details: { pageCount: 11 } },
    { code: "PASSWORD", fixture: "password-protected.pdf" },
    { code: "PDF_PARSE", fixture: "not-a-pdf.pdf" },
    { code: "NO_TEXT", fixture: "blank.pdf" },
  ];

  for (const { code, fixture, details } of cases) {
    test(`${code}: ${fixture}`, async ({ page }) => {
      await stubPuter(page, [replies.analysis()]);
      await page.goto("/");

      await chooseFixture(page, fixture);

      await expect(errorCard(page)).toHaveText(messageFor(code, details));
      await expect(uploadHeading(page)).toBeVisible();
      expect(await getPuterCalls(page)).toEqual([]);
    });
  }

  test("PDF_LIB_LOAD: the pdf.js download fails", async ({ page }) => {
    await stubPuter(page, [replies.analysis()]);
    await page.route((url) => isPdfLibraryUrl(url.href), (route) => route.abort());
    await page.goto("/");

    await chooseFixture(page, "resume.pdf");

    await expect(errorCard(page)).toHaveText(messageFor("PDF_LIB_LOAD"));
    await expect(uploadHeading(page)).toBeVisible();
    expect(await getPuterCalls(page)).toEqual([]);
  });

  // pdf.js reports this as "Setting up fake worker failed", which must not
  // be shown as a problem with the user's file (PDF_PARSE).
  const workerFailures = [
    { title: "is aborted", respond: (route) => route.abort() },
    {
      title: "returns 404",
      respond: (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }),
    },
  ];

  for (const { title, respond } of workerFailures) {
    test(`PDF_LIB_LOAD: the pdf.js worker download ${title}`, async ({ page }) => {
      await stubPuter(page, [replies.analysis()]);
      const workerRequests = [];
      await page.route(
        (url) => isPdfWorkerUrl(url.href),
        (route) => {
          workerRequests.push(route.request().url());
          return respond(route);
        },
      );
      await page.goto("/");

      await chooseFixture(page, "resume.pdf");

      await expect(errorCard(page)).toHaveText(messageFor("PDF_LIB_LOAD"));
      expect(workerRequests.length).toBeGreaterThan(0);
      await expect(uploadHeading(page)).toBeVisible();
      expect(await getPuterCalls(page)).toEqual([]);
    });
  }

  test("PDF_TIMEOUT: reading the PDF doesn't finish in time", async ({ page }) => {
    await page.clock.install();
    await stubPuter(page, [replies.analysis()]);
    // The worker script never arrives, so pdf.js never finishes reading. The
    // handler deliberately neither fulfils nor aborts the request.
    await page.route((url) => isPdfWorkerUrl(url.href), () => {});
    await page.goto("/");

    const workerRequested = page.waitForRequest((request) => isPdfWorkerUrl(request.url()));
    await chooseFixture(page, "resume.pdf");
    // The read's time limit starts in the same task that asks for the worker.
    await workerRequested;
    await expect(analysisStatus(page)).toHaveText("Reading your PDF, step 1 of 3");

    await page.clock.fastForward(PDF_TIMEOUT_MS - 1_000);
    await expect(analysisStatus(page)).toHaveText("Reading your PDF, step 1 of 3");
    await expect(errorCard(page)).toHaveCount(0);

    await page.clock.fastForward(1_000);
    await expect(errorCard(page)).toHaveText(messageFor("PDF_TIMEOUT"));
    await expect(loadingHeading(page)).toHaveCount(0);
    await expect(analysisStatus(page)).toBeEmpty();
    expect(await getPuterCalls(page)).toEqual([]);
  });
});

test.describe("AI request failures", () => {
  const cases = [
    {
      code: "AI_FAILED",
      title: "an Error without a code or status",
      reply: replies.errorRejection("Failed to fetch"),
    },
    {
      code: "AI_FAILED",
      title: "a synchronous throw",
      reply: replies.synchronousThrow("puter.ai.chat is not ready"),
    },
    {
      code: "AI_USAGE_LIMIT",
      title: "a rejection with a nested insufficient_funds code",
      reply: replies.rejection({
        success: false,
        error: { code: "insufficient_funds", message: "Not enough funds" },
      }),
    },
    {
      code: "AI_USAGE_LIMIT",
      title: "a resolved { success: false } failure",
      reply: replies.failedResponse({ code: "usage_limited", message: "Usage limit reached" }),
    },
    {
      code: "AI_USAGE_LIMIT",
      title: "an XMLHttpRequest-like 402",
      reply: replies.rejection({ status: 402, statusText: "Payment Required", responseText: "" }),
    },
    {
      code: "AI_SIGN_IN_CLOSED",
      title: "the sign-in window was closed",
      reply: replies.errorRejection("Authentication window was closed", {
        code: "auth_window_closed",
      }),
    },
    {
      code: "AI_POPUP_BLOCKED",
      title: "the sign-in pop-up was blocked",
      reply: replies.failedResponse({ code: "popup_blocked", message: "Popup blocked" }),
    },
    {
      code: "AI_AUTH",
      title: "an XMLHttpRequest-like 401",
      reply: replies.rejection({
        status: 401,
        statusText: "Unauthorized",
        responseText: '{"message":"Unauthorized"}',
      }),
    },
  ];

  for (const { code, title, reply } of cases) {
    test(`${code}: ${title}`, async ({ page }) => {
      await stubPuter(page, [reply, replies.analysis()]);
      await page.goto("/");

      await chooseFixture(page, "resume.pdf");

      await expect(errorCard(page)).toHaveText(messageFor(code));
      await expect(uploadHeading(page)).toBeVisible();
      // Failed requests are not sent again.
      expect(await getPuterCalls(page)).toHaveLength(1);
    });
  }

  test("AI_BAD_RESPONSE: an unreadable reply is asked for once more, then reported", async ({ page }) => {
    await stubPuter(page, [replies.text("Sorry, I can only answer in prose today.")]);
    await page.goto("/");

    await chooseFixture(page, "resume.pdf");

    await expect(errorCard(page)).toHaveText(messageFor("AI_BAD_RESPONSE"));
    const calls = await getPuterCalls(page);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  test("an unreadable reply followed by a good one reaches the dashboard", async ({ page }) => {
    await stubPuter(page, [
      replies.text('{"overallScore": "not a number"}'),
      replies.analysis(makeAnalysis({ overallScore: 77 })),
    ]);
    await page.goto("/");

    await chooseFixture(page, "resume.pdf");

    await expect(dashboardHeading(page)).toBeVisible();
    await expect(page.locator(".score-breakdown-text")).toContainText("AI review 77");
    await expect(errorCard(page)).toHaveCount(0);
    expect(await getPuterCalls(page)).toHaveLength(2);
  });

  test("a previous error is cleared while the next file is analyzed", async ({ page }) => {
    await stubPuter(page, [replies.errorRejection("Failed to fetch"), replies.heldAnalysis()]);
    await page.goto("/");
    await chooseFixture(page, "resume.pdf");
    await expect(errorCard(page)).toHaveText(messageFor("AI_FAILED"));

    await chooseFixture(page, "resume.pdf");

    await expect(loadingHeading(page)).toBeVisible();
    await expect(errorCard(page)).toHaveCount(0);
    await releaseHeldReply(page);
    await expect(dashboardHeading(page)).toBeVisible();
  });

  test("AI_TIMEOUT: no reply within the time limit", async ({ page }) => {
    await page.clock.install();
    await stubPuter(page, [replies.neverSettles()]);
    await page.goto("/");

    await chooseFixture(page, "resume.pdf");
    await expect(analysisStatus(page)).toHaveText("Analyzing with AI, step 2 of 3");
    await expect.poll(async () => (await getPuterCalls(page)).length).toBe(1);

    await page.clock.fastForward(AI_TIMEOUT_MS - 1_000);
    await expect(analysisStatus(page)).toHaveText("Analyzing with AI, step 2 of 3");
    await expect(errorCard(page)).toHaveCount(0);

    await page.clock.fastForward(1_000);
    await expect(errorCard(page)).toHaveText(messageFor("AI_TIMEOUT"));
    await expect(loadingHeading(page)).toHaveCount(0);
    await expect(analysisStatus(page)).toBeEmpty();
    expect(await getPuterCalls(page)).toHaveLength(1);
  });
});

// No AI reply was found that makes the dashboard throw: normalizeAnalysis()
// hands it only checked strings, numbers and lists. These tests instead make
// a built-in that the components call while rendering throw for one specific
// number, which reaches the error boundaries without changing any app code.
test.describe("error boundaries", () => {
  /** Until disarmed, Number.prototype.toLocaleString throws for `failingNumber`. */
  async function armToLocaleStringFailure(page, failingNumber) {
    await page.evaluate((number) => {
      const original = window.__e2eOriginalToLocaleString ?? Number.prototype.toLocaleString;
      window.__e2eOriginalToLocaleString = original;
      window.__forcedRenderFailures = 0;
      Number.prototype.toLocaleString = function toLocaleString(...args) {
        if (Number(this) === number) {
          window.__forcedRenderFailures += 1;
          throw new Error(`e2e: forced render failure formatting ${number}`);
        }
        return original.apply(this, args);
      };
    }, failingNumber);
  }

  async function disarmToLocaleStringFailure(page) {
    await page.evaluate(() => {
      Number.prototype.toLocaleString = window.__e2eOriginalToLocaleString;
    });
  }

  /** Every console.error text logged by the page from now on. */
  function collectConsoleErrors(page) {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    return errors;
  }

  const loggedBy = (consoleErrors, boundaryName) =>
    consoleErrors.some((text) =>
      text.startsWith(`[ErrorBoundary:${boundaryName}] render failed:`),
    );

  test("a report that fails to render shows the dashboard fallback, which recovers", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");

    // 15,000 is formatted only by the dashboard's truncation notice.
    await armToLocaleStringFailure(page, 15_000);
    await chooseFixture(page, "long-resume.pdf");

    const fallback = page.getByRole("alert");
    await expect(fallback).toContainText("The report couldn't be displayed");
    expect(await page.evaluate(() => window.__forcedRenderFailures)).toBeGreaterThan(0);
    await expect.poll(() => loggedBy(consoleErrors, "dashboard")).toBe(true);
    expect(loggedBy(consoleErrors, "app")).toBe(false);

    await disarmToLocaleStringFailure(page);
    await fallback.getByRole("button", { name: "Analyze another resume" }).click();
    await expect(uploadHeading(page)).toBeVisible();

    // The same resume now renders.
    await chooseFixture(page, "long-resume.pdf");
    await expect(dashboardHeading(page)).toBeVisible();
    await expect(page.locator(".truncation-notice")).toBeVisible();
  });

  test("a screen that fails to render shows the app fallback, which reloads", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await stubPuter(page, [replies.analysis()]);
    await page.goto("/");

    // 5,000 is formatted only by the job description's character counter.
    await armToLocaleStringFailure(page, 5_000);
    await addJobDescriptionButton(page).click();

    const fallback = page.getByRole("alert");
    await expect(fallback).toContainText("This page couldn't be displayed");
    await expect(uploadHeading(page)).toHaveCount(0);
    await expect.poll(() => loggedBy(consoleErrors, "app")).toBe(true);

    // The reload starts a fresh page, without the patched toLocaleString.
    await Promise.all([
      page.waitForEvent("load"),
      fallback.getByRole("button", { name: "Reload page" }).click(),
    ]);
    await expect(uploadHeading(page)).toBeVisible();
    await addJobDescriptionButton(page).click();
    await expect(jobDescriptionField(page)).toBeVisible();
  });
});
