import { describe, expect, it } from "vitest";
import { captureNotes, type FontCapture } from "./fontIdentify";

const base: FontCapture = {
  x: 0,
  y: 0,
  width: 300,
  height: 40,
  ocr: { text: "Hello world", lines: [{ text: "Hello world", words: [] }], language: "en-US" },
  ocrError: null,
  exact: null,
  textHeight: 22,
  elapsedMs: 120,
};

describe("capture notes", () => {
  it("has nothing to say about a clean single line", () => {
    expect(captureNotes(base)).toEqual([]);
  });

  it("explains missing text, OCR errors, small text and many lines", () => {
    expect(captureNotes({ ...base, ocr: { ...base.ocr!, text: "  " } })[0]).toMatch(/No text was found/);
    expect(captureNotes({ ...base, ocr: null, ocrError: "Windows text recognition failed: x" })).toEqual(["Windows text recognition failed: x"]);
    expect(captureNotes({ ...base, textHeight: 9 })[0]).toMatch(/about 9 px tall/);
    const lines = Array.from({ length: 4 }, () => ({ text: "a", words: [] }));
    expect(captureNotes({ ...base, ocr: { ...base.ocr!, lines } })[0]).toMatch(/Several lines/);
  });
});
