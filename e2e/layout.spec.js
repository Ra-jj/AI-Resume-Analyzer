import {
  addJobDescriptionButton,
  chooseFixture,
  dashboardHeading,
  expect,
  expectNoHorizontalOverflow,
  fileInput,
  jobDescriptionField,
  test,
} from "./helpers/test.js";
import { makeAnalysis, makeJobMatch, replies, stubPuter } from "./helpers/puter.js";

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
  await expect(page.getByRole("status")).toBeVisible();
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
