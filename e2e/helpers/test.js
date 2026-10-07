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
 * request to another host is aborted, and the Google Fonts stylesheet is
 * answered with an empty one. Puter is therefore blocked unless a test calls
 * stubPuter() (helpers/puter.js), whose route is registered later and so
 * takes precedence: Playwright runs matching routes newest first.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route(isExternalHttpUrl, (route) => route.abort("blockedbyclient"));
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: "" }),
    );
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
