import { oklch } from "culori";
import { describe, expect, it } from "vitest";
import { seeded } from "./palette";
import {
  dailySeed,
  dailyStreak,
  distance,
  EMPTY_STATS,
  makePuzzle,
  makeRound,
  OPTIONS,
  parseStats,
  points,
  recordRound,
  ROUND_LENGTH,
  shareLine,
  SHOWN,
  today,
  type Axis,
} from "./guess";

describe("puzzles", () => {
  it("are the same for the same seed", () => {
    expect(makeRound(42)).toEqual(makeRound(42));
    expect(makeRound(42)).not.toEqual(makeRound(43));
  });

  it("step evenly on their axis and offer the answer among distinct options", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const p of makeRound(seed)) {
        expect(p.shown).toHaveLength(SHOWN);
        expect(p.options).toHaveLength(OPTIONS);
        expect(p.options).toContain(p.answer);
        for (let i = 0; i < p.options.length; i++)
          for (let j = i + 1; j < p.options.length; j++) expect(distance(p.options[i], p.options[j])).toBeGreaterThanOrEqual(3);
        const seq = [...p.shown, p.answer].map((h) => oklch(h)!);
        const value = (c: (typeof seq)[number]) => (p.axis === "hue" ? c.h ?? 0 : p.axis === "lightness" ? c.l : c.c);
        const diffs = seq.slice(1).map((c, i) => {
          const d = value(c) - value(seq[i]);
          return p.axis === "hue" ? ((d + 540) % 360) - 180 : d;
        });
        // Even steps, within 8-bit rounding.
        const tol = p.axis === "hue" ? 3.5 : 0.006;
        for (const d of diffs) expect(Math.abs(d - diffs[0])).toBeLessThan(tol);
      }
    }
  });

  it("uses each axis equally in a round", () => {
    const axes = makeRound(7).map((p) => p.axis);
    expect(axes).toHaveLength(ROUND_LENGTH);
    const count = (a: Axis) => axes.filter((x) => x === a).length;
    expect([count("hue"), count("lightness"), count("chroma")].sort()).toEqual([3, 3, 4]);
  });

  it("brings distractors closer as difficulty rises", () => {
    const mean = (d: number) => {
      let sum = 0;
      let n = 0;
      for (let s = 1; s <= 40; s++) {
        const p = makePuzzle("lightness", seeded(s), d);
        for (const o of p.options) if (o !== p.answer) (sum += distance(o, p.answer)), n++;
      }
      return sum / n;
    };
    expect(mean(1)).toBeLessThan(mean(0));
  });
});

describe("scoring and stats", () => {
  it("scores by closeness", () => {
    expect(points("#336699", "#336699")).toBe(100);
    expect(points("#336699", "#33669A")).toBeGreaterThan(80);
    expect(points("#000000", "#FFFFFF")).toBe(0);
  });

  it("gives everyone the same daily seed per date", () => {
    expect(dailySeed("2026-11-01")).toBe(dailySeed("2026-11-01"));
    expect(dailySeed("2026-11-01")).not.toBe(dailySeed("2026-11-02"));
    expect(today(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("records bests and the first daily result only", () => {
    let s = recordRound(EMPTY_STATS, { score: 700, bestStreak: 3, date: "2026-11-01" });
    s = recordRound(s, { score: 900, bestStreak: 2, date: "2026-11-01" });
    s = recordRound(s, { score: 400, bestStreak: 5 });
    expect(s).toEqual({ rounds: 3, bestScore: 900, bestStreak: 5, daily: { "2026-11-01": 700 } });
    expect(parseStats(JSON.stringify(s))).toEqual(s);
    expect(parseStats("nope")).toEqual(EMPTY_STATS);
  });

  it("counts daily streaks ending today or yesterday", () => {
    const s = { ...EMPTY_STATS, daily: { "2026-10-29": 1, "2026-10-30": 1, "2026-10-31": 1 } };
    expect(dailyStreak(s, "2026-11-01")).toBe(3);
    expect(dailyStreak(s, "2026-10-31")).toBe(3);
    expect(dailyStreak(s, "2026-11-03")).toBe(0);
    expect(shareLine(812, 10, "2026-11-01")).toBe("Huetype daily 2026-11-01: 812 / 1000");
  });
});
