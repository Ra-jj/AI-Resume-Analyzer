import { AnalysisError } from "../src/lib/errors.js";
import { MAX_JOB_DESCRIPTION_CHARACTERS, prepareJobDescription } from "../src/lib/limits.js";
import { buildAnalysisMessages } from "../src/lib/prompt.js";
import {
  addJobDescriptionButton,
  analysisStatus,
  chooseFixture,
  dashboardHeading,
  expect,
  fileInput,
  jobDescriptionField,
  loadingHeading,
  test,
  uploadHeading,
} from "./helpers/test.js";
import {
  getPuterCalls,
  makeAnalysis,
  makeJobMatch,
  replies,
  resumeTextOf,
  stubPuter,
} from "./helpers/puter.js";

// Over the 100-character minimum, with runs of whitespace the app collapses.
const JOB_DESCRIPTION = `Senior Backend Engineer, Payments Platform

We are looking for an engineer with   5+ years of Go or Rust, Kubernetes, PostgreSQL
and experience leading incident response as an on-call Incident Commander.`;

const JD_TOO_SHORT_MESSAGE = new AnalysisError("JD_TOO_SHORT").message;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The report's "Job match" section, a region named by its heading. */
function jobMatchSection(page) {
  return page.getByRole("region", { name: "Job match" });
}

test("is collapsed by default, opens into a focused field with a counter, and Clear closes it", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");

  await expect(addJobDescriptionButton(page)).toBeVisible();
  await expect(jobDescriptionField(page)).toHaveCount(0);

  await addJobDescriptionButton(page).click();
  const field = jobDescriptionField(page);
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await expect(page.locator(".jd-count")).toHaveText("0 / 5,000");

  await field.pressSequentially("Backend engineer");
  await expect(page.locator(".jd-count")).toHaveText("16 / 5,000");

  await page.getByRole("button", { name: "Clear job description" }).click();
  await expect(jobDescriptionField(page)).toHaveCount(0);
  await expect(addJobDescriptionButton(page)).toBeFocused();

  // Clear also emptied it.
  await addJobDescriptionButton(page).click();
  await expect(jobDescriptionField(page)).toHaveValue("");
});

test("stops the job description at 5,000 characters", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();

  await jobDescriptionField(page).fill("a".repeat(MAX_JOB_DESCRIPTION_CHARACTERS + 1000));

  await expect(jobDescriptionField(page)).toHaveValue("a".repeat(MAX_JOB_DESCRIPTION_CHARACTERS));
  await expect(page.locator(".jd-count")).toHaveText("5,000 / 5,000");
  await expect(page.locator(".jd-count")).toHaveClass(/jd-count--full/);
});

test("rejects a too-short job description on the field itself, without calling the AI", async ({ page }) => {
  await stubPuter(page, [replies.analysis()]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();
  const field = jobDescriptionField(page);
  await field.fill("Backend engineer, Go");

  await chooseFixture(page, "resume.pdf");

  await expect(page.locator(".jd-panel .jd-error")).toHaveText(JD_TOO_SHORT_MESSAGE);
  await expect(field).toHaveAttribute("aria-invalid", "true");
  // The message comes first in the field's description.
  await expect(field).toHaveAccessibleDescription(new RegExp(`^${escapeRegExp(JD_TOO_SHORT_MESSAGE)}`));
  await expect(field).toBeFocused();
  // Not in the general error card under the dropzone.
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(loadingHeading(page)).toHaveCount(0);
  await expect(analysisStatus(page)).toBeEmpty();
  await expect(uploadHeading(page)).toBeVisible();
  expect(await getPuterCalls(page)).toEqual([]);
  // Cleared so that the same file can be chosen again.
  await expect(fileInput(page)).toHaveValue("");

  // Editing the text removes the message.
  await field.fill(JOB_DESCRIPTION);
  await expect(page.locator(".jd-error")).toHaveCount(0);
  await expect(field).not.toHaveAttribute("aria-invalid");

  // The same file, chosen again, is now analyzed.
  await chooseFixture(page, "resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();
  expect(await getPuterCalls(page)).toHaveLength(1);
});

test("sends a valid job description and shows the match and the Job match section", async ({ page }) => {
  const jobMatch = makeJobMatch();
  await stubPuter(page, [replies.analysis(makeAnalysis({ jobMatch }))]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();
  await jobDescriptionField(page).fill(JOB_DESCRIPTION);

  await chooseFixture(page, "resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();

  const [[messages]] = await getPuterCalls(page);
  const preparedJobDescription = prepareJobDescription(JOB_DESCRIPTION).text;
  expect(messages[1].content).toContain(
    `<job_description>\n${preparedJobDescription}\n</job_description>`,
  );
  const resumeText = resumeTextOf(messages);
  expect(messages).toEqual(buildAnalysisMessages(resumeText, preparedJobDescription));

  // The percentage is in the score block, as a paragraph; the section has
  // the rest.
  await expect(page.locator(".score-block .match-mark")).toHaveText(/^74%\s*Match with this role$/);
  await expect(page.getByRole("heading", { name: /match with this role|74%/i })).toHaveCount(0);
  const section = jobMatchSection(page);
  await expect(section).toBeVisible();
  await expect(section).toContainText(jobMatch.summary);
  await expect(section.locator(".keyword--matched")).toHaveText(jobMatch.matchedKeywords);
  await expect(section.locator(".keyword--missing")).toHaveText(jobMatch.missingKeywords);
});

test("shows the report without a match or Job match section when the reply has no usable jobMatch", async ({ page }) => {
  await stubPuter(page, [replies.analysis(makeAnalysis({ jobMatch: { matchScore: "n/a" } }))]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();
  await jobDescriptionField(page).fill(JOB_DESCRIPTION);

  await chooseFixture(page, "resume.pdf");

  await expect(dashboardHeading(page)).toBeVisible();
  await expect(jobMatchSection(page)).toHaveCount(0);
  await expect(page.locator(".match-mark")).toHaveCount(0);
});

test("keeps the job description after Analyze another resume", async ({ page }) => {
  await stubPuter(page, [replies.analysis(makeAnalysis({ jobMatch: makeJobMatch() }))]);
  await page.goto("/");
  await addJobDescriptionButton(page).click();
  await jobDescriptionField(page).fill(JOB_DESCRIPTION);
  await chooseFixture(page, "resume.pdf");
  await expect(dashboardHeading(page)).toBeVisible();

  await page.getByRole("button", { name: "Analyze another resume" }).click();

  await expect(uploadHeading(page)).toBeVisible();
  await expect(jobDescriptionField(page)).toHaveValue(JOB_DESCRIPTION);
  await expect(page.locator(".jd-count")).toHaveText(
    `${JOB_DESCRIPTION.length.toLocaleString("en-US")} / 5,000`,
  );
  // Returning to the upload screen doesn't move focus into the field.
  await expect(jobDescriptionField(page)).not.toBeFocused();
});
