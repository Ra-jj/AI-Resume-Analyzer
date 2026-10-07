import { AnalysisError } from "../src/lib/errors.js";
import {
  addJobDescriptionButton,
  createFileDataTransfer,
  dashboardHeading,
  expect,
  fileInput,
  fixturePath,
  isPdfLibraryUrl,
  test,
} from "./helpers/test.js";
import { getPuterCalls, releaseHeldReply, replies, stubPuter } from "./helpers/puter.js";

const dropzone = (page) => page.locator(".dropzone-wrapper");

async function openUploadPage(page, plannedReplies = [replies.analysis()]) {
  await stubPuter(page, plannedReplies);
  await page.goto("/");
}

test.describe("drag and drop", () => {
  test("a PDF dropped on the dropzone is analyzed", async ({ page }) => {
    await openUploadPage(page);
    const dataTransfer = await createFileDataTransfer(page, "resume.pdf");

    await dropzone(page).dispatchEvent("dragenter", { dataTransfer });
    await expect(dropzone(page)).toHaveClass(/\bis-drag-active\b/);
    await dropzone(page).dispatchEvent("dragover", { dataTransfer });
    await dropzone(page).dispatchEvent("drop", { dataTransfer });

    await expect(dashboardHeading(page)).toBeVisible();
    const [[messages]] = await getPuterCalls(page);
    expect(messages[1].content).toContain("Jordan Avery");
  });

  test("a real (trusted) drag of a PDF file onto the dropzone is analyzed", async ({ page }) => {
    await openUploadPage(page);
    // Input.dispatchDragEvent drives Chrome's own drag and drop, so the drop
    // only lands if the dropzone cancels dragover, as in a real drag.
    const cdp = await page.context().newCDPSession(page);
    const data = { items: [], files: [fixturePath("resume.pdf")], dragOperationsMask: 1 };
    const box = await dropzone(page).boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + 24 };

    await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", ...point, data });
    await cdp.send("Input.dispatchDragEvent", { type: "dragOver", ...point, data });
    await expect(dropzone(page)).toHaveClass(/\bis-drag-active\b/);
    await cdp.send("Input.dispatchDragEvent", { type: "drop", ...point, data });

    await expect(dashboardHeading(page)).toBeVisible();
    expect(await getPuterCalls(page)).toHaveLength(1);
  });

  test("the highlight stays on over the dropzone's children and clears when the drag leaves", async ({ page }) => {
    await openUploadPage(page);
    const dataTransfer = await createFileDataTransfer(page, "resume.pdf");
    const child = page.getByRole("heading", { name: "Upload Your Resume" });

    await dropzone(page).dispatchEvent("dragenter", { dataTransfer });
    await child.dispatchEvent("dragenter", { dataTransfer });
    await child.dispatchEvent("dragleave", { dataTransfer });
    await expect(dropzone(page)).toHaveClass(/\bis-drag-active\b/);

    await dropzone(page).dispatchEvent("dragleave", { dataTransfer });
    await expect(dropzone(page)).not.toHaveClass(/\bis-drag-active\b/);
    expect(await getPuterCalls(page)).toEqual([]);
  });

  test("the highlight clears after a drop, even one that is rejected", async ({ page }) => {
    await openUploadPage(page);
    const textFile = await page.evaluateHandle(() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
      return dataTransfer;
    });

    await dropzone(page).dispatchEvent("dragenter", { dataTransfer: textFile });
    await expect(dropzone(page)).toHaveClass(/\bis-drag-active\b/);
    await dropzone(page).dispatchEvent("drop", { dataTransfer: textFile });

    await expect(page.getByRole("alert")).toHaveText(new AnalysisError("INVALID_TYPE").message);
    await expect(dropzone(page)).not.toHaveClass(/\bis-drag-active\b/);
    // The drop also reset the enter/leave count, so one enter and one leave
    // leave the highlight off.
    await dropzone(page).dispatchEvent("dragenter", { dataTransfer: textFile });
    await dropzone(page).dispatchEvent("dragleave", { dataTransfer: textFile });
    await expect(dropzone(page)).not.toHaveClass(/\bis-drag-active\b/);
  });

  test("two drops at the same moment start only one analysis", async ({ page }) => {
    await openUploadPage(page, [replies.heldAnalysis()]);
    const dataTransfer = await createFileDataTransfer(page, "resume.pdf");

    // Both drops arrive before React re-renders with the loading state.
    await page.evaluate((transfer) => {
      const zone = document.querySelector(".dropzone-wrapper");
      for (let dropCount = 0; dropCount < 2; dropCount++) {
        zone.dispatchEvent(
          new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
      }
    }, dataTransfer);

    await releaseHeldReply(page);
    await expect(dashboardHeading(page)).toBeVisible();
    // Every PDF read has finished (its worker released) before counting calls.
    await expect.poll(() => page.workers().length).toBe(0);
    expect(await getPuterCalls(page)).toHaveLength(1);
  });

  test("a file dropped outside the dropzone is blocked and not analyzed", async ({ page }) => {
    await openUploadPage(page);
    const dataTransfer = await createFileDataTransfer(page, "resume.pdf");

    // Cancelling dragover and drop is what stops the browser from opening
    // the dropped file in place of the app.
    const outcome = await page.evaluate((transfer) => {
      const target = document.querySelector(".upload-subtitle");
      const dragover = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });
      target.dispatchEvent(dragover);
      const dropEffect = transfer.dropEffect;
      const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
      target.dispatchEvent(drop);
      return {
        dragoverCancelled: dragover.defaultPrevented,
        dropEffect,
        dropCancelled: drop.defaultPrevented,
      };
    }, dataTransfer);

    expect(outcome).toEqual({ dragoverCancelled: true, dropEffect: "none", dropCancelled: true });
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(await getPuterCalls(page)).toEqual([]);
  });
});

test("Tab reaches the job description button, then the file input, with a visible focus ring", async ({ page }) => {
  await openUploadPage(page);
  const uploadButton = page.locator("label.gradient-btn");
  const outlineOf = (locator) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });

  await page.keyboard.press("Tab");
  await expect(addJobDescriptionButton(page)).toBeFocused();
  expect(await outlineOf(addJobDescriptionButton(page))).toEqual({ style: "solid", width: "2px" });

  expect((await outlineOf(uploadButton)).style).toBe("none");
  const pdfLibraryRequest = page.waitForRequest((request) => isPdfLibraryUrl(request.url()), {
    timeout: 5_000,
  });
  await page.keyboard.press("Tab");
  await expect(fileInput(page)).toBeFocused();
  // The input is visually hidden, so the ring is drawn on its label.
  expect(await outlineOf(uploadButton)).toEqual({ style: "solid", width: "2px" });
  // Keyboard focus on the button also starts loading pdf.js.
  await pdfLibraryRequest;
});
