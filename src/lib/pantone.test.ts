import { describe, expect, it } from "vitest";
import { byDecade, COTY, COTY_YEARS, cotyCss, cotyYear, FIRST_YEAR, LAST_YEAR, pantoneLabel } from "./pantone";

describe("Pantone Color of the Year data", () => {
  it("covers every year from 2002 to 2026 once", () => {
    expect(FIRST_YEAR).toBe(2002);
    expect(LAST_YEAR).toBe(2026);
    expect(COTY_YEARS.map((y) => y.year)).toEqual(Array.from({ length: 25 }, (_, i) => 2002 + i));
  });

  it("has well-formed codes and hex values", () => {
    for (const c of COTY) {
      expect(c.code).toMatch(/^\d{2}-\d{4}$/);
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.name.trim()).toBe(c.name);
      expect(c.note.length).toBeGreaterThan(10);
    }
    expect(new Set(COTY.map((c) => c.code)).size).toBe(COTY.length);
  });

  it("has two colors only in 2016 and 2021", () => {
    expect(COTY_YEARS.filter((y) => y.colors.length !== 1).map((y) => y.year)).toEqual([2016, 2021]);
    expect(COTY).toHaveLength(27);
  });

  it("labels, looks up and exports", () => {
    expect(pantoneLabel(cotyYear(2025)!.colors[0])).toBe("PANTONE 17-1230 Mocha Mousse");
    expect(cotyYear(1999)).toBeUndefined();
    const css = cotyCss();
    expect(css.split("\n")[1]).toContain("--coty-2026-cloud-dancer: #F0EEE9;");
    expect(css).toContain("--coty-2016-rose-quartz: #F7CAC9;");
  });

  it("groups years by decade, newest first", () => {
    const d = byDecade();
    expect(d.map((x) => x.decade)).toEqual([2020, 2010, 2000]);
    expect(d[0].years[0].year).toBe(2026);
    expect(d[2].years[d[2].years.length - 1].year).toBe(2002);
  });
});
