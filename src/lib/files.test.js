import { describe, expect, it } from "vitest";

import { isFileDrag, isFileTooLarge, isPdfFile } from "./files.js";
import { MAX_FILE_SIZE_BYTES } from "./limits.js";

const fileLike = (name, type, size = 1) => ({ name, type, size });

describe("isPdfFile", () => {
  it.each([
    ["application/pdf type", fileLike("a.pdf", "application/pdf"), true],
    ["application/pdf type with any name", fileLike("x.bin", "application/pdf"), true],
    ["empty type and a .pdf name", fileLike("a.pdf", ""), true],
    ["empty type and a .PDF name", fileLike("Resume.PDF", ""), true],
    ["empty type and the name '.pdf'", fileLike(".pdf", ""), true],
    ["empty type and a .pdf.txt name", fileLike("resume.pdf.txt", ""), false],
    ["empty type and a .pdf.exe name", fileLike("a.pdf.exe", ""), false],
    ["empty type and no extension", fileLike("a", ""), false],
    ["empty type and no name", fileLike(undefined, ""), false],
    ["text/plain type with a .pdf name", fileLike("resume.pdf", "text/plain"), false],
    ["application/x-pdf type", fileLike("a.pdf", "application/x-pdf"), false],
    ["image/png", fileLike("a.png", "image/png"), false],
    ["null", null, false],
    ["undefined", undefined, false],
  ])("%s -> %s", (_label, file, expected) => {
    expect(isPdfFile(file)).toBe(expected);
  });
});

describe("isFileTooLarge", () => {
  it("allows exactly 10 MB and rejects one byte more", () => {
    expect(isFileTooLarge({ size: MAX_FILE_SIZE_BYTES })).toBe(false);
    expect(isFileTooLarge({ size: 10 * 1024 * 1024 + 1 })).toBe(true);
    expect(isFileTooLarge({ size: 0 })).toBe(false);
  });
});

describe("isFileDrag", () => {
  it.each([
    ["a types array with Files", { dataTransfer: { types: ["text/uri-list", "Files"] } }, true],
    ["a DOMStringList-like types list with Files", { dataTransfer: { types: { length: 1, 0: "Files" } } }, true],
    ["a text drag", { dataTransfer: { types: ["text/plain"] } }, false],
    ["no types", { dataTransfer: {} }, false],
    ["a null dataTransfer", { dataTransfer: null }, false],
    ["no dataTransfer", {}, false],
    ["null", null, false],
    ["undefined", undefined, false],
  ])("%s -> %s", (_label, event, expected) => {
    expect(isFileDrag(event)).toBe(expected);
  });
});
