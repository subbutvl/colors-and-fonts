import { describe, expect, it } from "vitest";
import { contrast, convert, formatColor, NAMED_COLORS, nearestName, parseColor } from "./colors";

describe("parseColor", () => {
  it("reads CSS, bare hex and triplets", () => {
    for (const input of ["#5B6CFF", "5b6cff", "rgb(91 108 255)", "91, 108, 255", "91 108 255"]) {
      expect(convert(parseColor(input)!).hex).toBe("#5B6CFF");
    }
    expect(parseColor("nope")).toBeUndefined();
    expect(parseColor("300, 0, 0")).toBeUndefined();
  });
});

describe("convert", () => {
  it("writes every format", () => {
    const rows = Object.fromEntries(convert(parseColor("#5B6CFF")!).rows.map((r) => [r.id, r.value]));
    expect(rows.rgb).toBe("rgb(91, 108, 255)");
    expect(rows.hsl).toBe("hsl(233.8, 100%, 67.8%)");
    expect(rows.cmyk).toBe("cmyk(64%, 58%, 0%, 0%)");
    expect(rows.oklch).toMatch(/^oklch\(60\.2% 0\.21\d\d 273\)$/);
  });
  it("keeps alpha", () => {
    const c = convert(parseColor("hsl(200 50% 50% / .5)")!);
    expect(c.alpha).toBe(0.5);
    expect(c.rows[0].value).toBe("#4095BF80");
  });
  it("gamut-maps colors outside sRGB", () => {
    const c = convert(parseColor("oklch(70% 0.4 150)")!);
    expect(c.outOfGamut).toBe(true);
    expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("names and formats", () => {
  it("has the 148 CSS names", () => {
    expect(NAMED_COLORS).toHaveLength(148);
    expect(nearestName("#FF0000")).toMatchObject({ name: "red", deltaE: 0 });
  });
  it("formats picks", () => {
    expect(formatColor("#5B6CFF", "rgb")).toBe("rgb(91, 108, 255)");
    expect(formatColor("#5b6cff", "hex")).toBe("#5B6CFF");
  });
  it("rates contrast", () => {
    expect(contrast("#000", "#fff").level).toBe("AAA");
    expect(contrast("#999", "#fff").level).toBe("Fail");
  });
});
