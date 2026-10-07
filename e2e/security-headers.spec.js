import { readFileSync } from "node:fs";

import {
  addJobDescriptionButton,
  chooseFixture,
  dashboardHeading,
  expect,
  isPdfWorkerUrl,
  jobDescriptionField,
  test,
} from "./helpers/test.js";
import { makeAnalysis, makeJobMatch, replies, stubPuter } from "./helpers/puter.js";

// The agreed headers, written out here rather than read from vercel.json, so
// a changed or weakened value in that file fails the tests. Puter.js loads
// scripts, opens a sign-in pop-up and talks to its own hosts, so there is
// deliberately no script or connection allow-list (script-src, connect-src,
// default-src) and no cross-origin isolation (COOP/COEP).
const AGREED_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

// vite.config.js gives `vite preview` the headers from vercel.json, so the
// served headers are compared with the agreed ones too.
const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const EXPECTED_HEADERS = Object.fromEntries(
  Object.entries(AGREED_HEADERS).map(([name, value]) => [name.toLowerCase(), value]),
);

const JOB_DESCRIPTION =
  "Senior Backend Engineer, Payments Platform. We are looking for an engineer with 5+ years of Go or Rust, Kubernetes and PostgreSQL.";

function expectSecurityHeaders(headers, what) {
  for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
    expect(headers[name], `${name} on ${what}`).toBe(value);
  }
}

test("vercel.json sets exactly the agreed headers, in one rule for every route", () => {
  // One rule only: a second one could add headers (COOP, say) to some routes.
  expect(vercelConfig.headers).toHaveLength(1);
  const [rule] = vercelConfig.headers;
  expect(rule.source).toBe("/(.*)");
  expect(Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]))).toEqual(
    AGREED_HEADERS,
  );
  // Only headers: no rewrites, redirects or build settings.
  expect(Object.keys(vercelConfig)).toEqual(["headers"]);
});

test("serves the page, its scripts and the pdf.js worker with the headers, and the app works under them", async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const assetHeaders = new Map();
  page.on("response", async (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith("/assets/")) assetHeaders.set(pathname, await response.allHeaders());
  });
  await stubPuter(page, [replies.analysis(makeAnalysis({ jobMatch: makeJobMatch() }))]);

  const documentResponse = await page.goto("/");
  expectSecurityHeaders(await documentResponse.allHeaders(), "the page");

  await addJobDescriptionButton(page).click();
  await jobDescriptionField(page).fill(JOB_DESCRIPTION);
  await chooseFixture(page, "resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job Match" })).toBeVisible();

  const workerPaths = [...assetHeaders.keys()].filter((path) => isPdfWorkerUrl(`http://x${path}`));
  expect(workerPaths, "the pdf.js worker was downloaded").toHaveLength(1);
  const scriptPaths = [...assetHeaders.keys()].filter((path) => path.endsWith(".js"));
  expect(scriptPaths.length).toBeGreaterThan(0);
  for (const path of [...workerPaths, ...scriptPaths]) {
    expectSecurityHeaders(assetHeaders.get(path), path);
  }
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test("the app can't be shown inside a frame", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");

  // Even a same-origin page is refused (frame-ancestors 'none', X-Frame-Options DENY).
  await page.setContent('<iframe id="embed" src="/" width="600" height="400"></iframe>');
  const frame = await (await page.locator("#embed").elementHandle()).contentFrame();
  // Chrome replaces a refused frame with its own error page.
  await expect.poll(() => frame.url()).toMatch(/^chrome-error:/);
  await expect(frame.locator("#root")).toHaveCount(0);
});
