import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { test as base, expect } from "@playwright/test";

export { expect };

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Absolute path of a file in e2e/fixtures/. */
export function fixturePath(name) {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}

function isExternalHttpUrl(url) {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !LOCAL_HOSTNAMES.has(url.hostname)
  );
}

/**
 * The Playwright `test` with a `page` that cannot reach the network: every
 * request to another host is aborted. (The fonts are served by the app
 * itself, from public/fonts.) Puter is therefore blocked unless a test calls
 * stubPuter() (helpers/puter.js), whose route is registered later and so
 * takes precedence: Playwright runs matching routes newest first.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route(isExternalHttpUrl, (route) => route.abort("blockedbyclient"));
    await provide(page);
  },
});

// pdf.js is split out of the main bundle: the library chunk, and its worker.
// The worker must be the package's minified build (pdf.worker.min.mjs).
const PDF_LIBRARY_CHUNK = /^\/assets\/pdf-[\w-]+\.js$/;
const PDF_WORKER_FILE = /^\/assets\/pdf\.worker\.min-[\w-]+\.mjs$/;

export function isPdfLibraryUrl(url) {
  return PDF_LIBRARY_CHUNK.test(new URL(url).pathname);
}

export function isPdfWorkerUrl(url) {
  return PDF_WORKER_FILE.test(new URL(url).pathname);
}

/** The visually hidden file input inside the "Choose PDF File" button. */
export function fileInput(page) {
  return page.getByLabel("Choose PDF File");
}

/** Chooses a file from e2e/fixtures/ in the upload button's file input. */
export async function chooseFixture(page, fixtureName) {
  await fileInput(page).setInputFiles(fixturePath(fixtureName));
}

export function dashboardHeading(page) {
  return page.getByRole("heading", { name: "Analysis Report" });
}

/** The loading screen's heading, shown only while a resume is analyzed. */
export function loadingHeading(page) {
  return page.getByRole("heading", { name: "Analyzing Your Resume" });
}

/**
 * The status line that names the current analysis step. Always on the
 * upload screen; empty when nothing is being analyzed.
 */
export function analysisStatus(page) {
  return page.getByRole("status");
}

export function uploadHeading(page) {
  return page.getByRole("heading", { name: "Upload Your Resume" });
}

export function addJobDescriptionButton(page) {
  return page.getByRole("button", { name: "Add a job description (optional)" });
}

export function jobDescriptionField(page) {
  return page.getByRole("textbox", { name: "Job description (optional)" });
}

/**
 * Builds, inside the page, a DataTransfer holding one fixture file, for
 * dispatching drag-and-drop events.
 */
export async function createFileDataTransfer(page, fixtureName) {
  const base64 = (await readFile(fixturePath(fixtureName))).toString("base64");
  return page.evaluateHandle(
    ({ fileBase64, name }) => {
      const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([bytes], name, { type: "application/pdf" }));
      return dataTransfer;
    },
    { fileBase64: base64, name: fixtureName },
  );
}

/** Asserts that the page is not wider than the viewport. */
export async function expectNoHorizontalOverflow(page, expectedViewportWidth) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(expectedViewportWidth);
  expect(scrollWidth, "page is wider than the viewport").toBeLessThanOrEqual(innerWidth);
}

/**
 * Colours and borders the print stylesheet gives the report, read after
 * page.emulateMedia({ media: "print" }). Borders read as "2px solid rgb(…)".
 */
export function reportPrintStyles(page) {
  return page.evaluate(() => {
    const style = (selector, pseudoElement) =>
      getComputedStyle(document.querySelector(selector), pseudoElement);
    const border = (selector) => {
      const computed = style(selector);
      return `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`;
    };
    const filled = (selector) => ({
      background: style(selector).backgroundColor,
      border: border(selector),
      colourAdjust: style(selector).getPropertyValue("print-color-adjust"),
    });
    return {
      body: style("body").backgroundColor,
      sheet: style(".report-sheet-inner").backgroundColor,
      sheetMarginRule: style(".report-sheet-inner").backgroundImage,
      heading: style(".dashboard-title").color,
      mutedText: style(".score-note").color,
      scoreBlock: {
        highlight: style(".score-block", "::before").backgroundColor,
        border: border(".score-block"),
        colourAdjust: style(".score-block").getPropertyValue("print-color-adjust"),
      },
      activeBand: {
        background: style(".score-scale-band--active").backgroundColor,
        colourAdjust: style(".score-scale-band--active").getPropertyValue("print-color-adjust"),
      },
      fixFirst: {
        background: style(".fix-first").backgroundColor,
        text: style(".fix-first-item-title").color,
        number: style(".fix-first-number").color,
        border: border(".fix-first"),
      },
      matchedKeyword: document.querySelector(".keyword--matched")
        ? filled(".keyword--matched")
        : null,
      fixFlag: document.querySelector(".fix-flag") ? filled(".fix-flag") : null,
      shadows: [...document.querySelectorAll("body *")]
        .map((element) => getComputedStyle(element).boxShadow)
        .filter((shadow) => shadow !== "none"),
    };
  });
}
