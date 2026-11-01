import { describe, expect, it } from "vitest";
import { apcaLc, apcaUse, flatten, passes, suggest, TARGETS, wcag } from "./contrast";

describe("wcag", () => {
  it("black on white is 21:1", () => {
    expect(wcag("#000", "#fff").ratio).toBeCloseTo(21, 5);
  });
  it("#767676 on white just passes AA", () => {
    const r = wcag("#767676", "#FFFFFF");
    expect(r.ratio).toBeCloseTo(4.54, 2);
    expect(r.aa).toBe(true);
    expect(r.aaa).toBe(false);
  });
});

describe("apca", () => {
  // Reference values from the APCA-W3 0.0.98G-4g readme.
  it("matches published values", () => {
    expect(apcaLc("#888888", "#FFFFFF")).toBeCloseTo(63.056469930209424, 6);
    expect(apcaLc("#FFFFFF", "#888888")).toBeCloseTo(-68.54146436644962, 6);
    expect(apcaLc("#000000", "#AAAAAA")).toBeCloseTo(58.146262578561334, 6);
    expect(apcaLc("#AAAAAA", "#000000")).toBeCloseTo(-56.24113336839742, 6);
  });
  it("is zero for identical colors", () => {
    expect(apcaLc("#5B6CFF", "#5B6CFF")).toBe(0);
  });
  it("describes levels", () => {
    expect(apcaUse(-95)).toBe("Preferred for body text");
    expect(apcaUse(50)).toBe("Large text and headlines");
  });
});

describe("suggest", () => {
  const aa = TARGETS[0];
  it("returns nothing for a passing pair", () => {
    expect(suggest("#000000", "#FFFFFF", aa)).toEqual([]);
  });
  it("finds a darker text that just passes, nearest first", () => {
    const s = suggest("#999999", "#FFFFFF", aa);
    expect(s.length).toBeGreaterThan(0);
    const first = s[0];
    expect(passes(first.side === "text" ? first.hex : "#999999", first.side === "text" ? "#FFFFFF" : first.hex, aa)).toBe(true);
    const darkerText = s.find((x) => x.side === "text" && x.direction === "darker")!;
    expect(darkerText).toBeDefined();
    expect(wcag(darkerText.hex, "#FFFFFF").ratio).toBeGreaterThanOrEqual(4.5);
    expect(wcag(darkerText.hex, "#FFFFFF").ratio).toBeLessThan(4.7);
    // White text cannot get lighter than white on white.
    expect(s.some((x) => x.side === "text" && x.direction === "lighter")).toBe(false);
  });
  it("keeps the hue of a colored text", () => {
    const s = suggest("#7C8CFF", "#FFFFFF", aa).find((x) => x.side === "text")!;
    expect(s.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(wcag(s.hex, "#FFFFFF").aa).toBe(true);
  });
  it("supports APCA targets", () => {
    const body = TARGETS.find((t) => t.kind === "apca" && t.lc === 75)!;
    const s = suggest("#888888", "#FFFFFF", body)[0];
    expect(Math.abs(apcaLc(s.side === "text" ? s.hex : "#888888", s.side === "text" ? "#FFFFFF" : s.hex))).toBeGreaterThanOrEqual(75);
  });
});

describe("flatten", () => {
  it("composites translucent colors before measuring", () => {
    expect(flatten("rgb(0 0 0 / 0.5)", "#FFFFFF")).toBe("#808080");
    expect(flatten("#5B6CFF", "#000000")).toBe("#5B6CFF");
    expect(wcag(flatten("rgb(0 0 0 / 0.5)", "#FFFFFF"), "#FFFFFF").ratio).toBeLessThan(4);
  });
});
