import { differenceCiede2000, displayable, formatHex, type Oklch } from "culori";
import { seeded, type Rand } from "./palette";

/**
 * Guess the color (12): pure, seedable puzzle generation and scoring.
 * Each puzzle shows four colors stepping evenly through one OKLCH axis
 * (hue, lightness or chroma); the player picks the fifth from five options.
 * A pick scores by CIEDE2000 distance to the answer, so a near miss still
 * earns points. Every color is inside sRGB without clamping, so the steps
 * stay exactly even.
 */
export type Axis = "hue" | "lightness" | "chroma";

export const AXIS_LABELS: Record<Axis, string> = { hue: "Hue", lightness: "Lightness", chroma: "Saturation" };

export interface Puzzle {
  axis: Axis;
  /** The sequence shown to the player. */
  shown: string[];
  answer: string;
  /** Five choices, shuffled; one is `answer`. */
  options: string[];
}

export const SHOWN = 4;
export const OPTIONS = 5;
export const ROUND_LENGTH = 10;

const deltaE = differenceCiede2000();
const wrap = (h: number) => ((h % 360) + 360) % 360;
const between = (rand: Rand, lo: number, hi: number) => lo + rand() * (hi - lo);

const toHex = (c: Oklch) => formatHex({ ...c, h: wrap(c.h ?? 0) }).toUpperCase();
const inGamut = (c: Oklch) => c.l >= 0 && c.l <= 1 && c.c >= 0 && displayable(c);

export function distance(a: string, b: string): number {
  return deltaE(a, b);
}

/** Points for a pick: 100 for the answer, less the further away it is. */
export function points(pick: string, answer: string): number {
  if (pick.toUpperCase() === answer.toUpperCase()) return 100;
  return Math.max(0, Math.round(90 - 7 * distance(pick, answer)));
}

interface Plan {
  start: Oklch;
  /** Change per step on the puzzle's axis. */
  step: number;
}

function plan(axis: Axis, rand: Rand): Plan {
  const h = between(rand, 0, 360);
  if (axis === "hue") {
    const step = between(rand, 16, 34) * (rand() < 0.5 ? -1 : 1);
    return { start: { mode: "oklch", l: between(rand, 0.62, 0.8), c: between(rand, 0.07, 0.13), h }, step };
  }
  if (axis === "lightness") {
    const step = between(rand, 0.07, 0.1);
    const up = rand() < 0.5;
    const l = up ? between(rand, 0.28, 0.4) : between(rand, 0.86, 0.95);
    return { start: { mode: "oklch", l, c: between(rand, 0.03, 0.09), h }, step: up ? step : -step };
  }
  return { start: { mode: "oklch", l: between(rand, 0.6, 0.75), c: between(rand, 0, 0.025), h }, step: between(rand, 0.022, 0.032) };
}

function at(axis: Axis, p: Plan, k: number): Oklch {
  const s = p.start;
  if (axis === "hue") return { ...s, h: wrap((s.h ?? 0) + p.step * k) };
  if (axis === "lightness") return { ...s, l: s.l + p.step * k };
  return { ...s, c: s.c + p.step * k };
}

/** Wrong answers: off by part of a step on the same axis, or right step but drifted on another axis. */
function candidates(axis: Axis, p: Plan, difficulty: number): Oklch[] {
  const answer = at(axis, p, SHOWN);
  const drift = 1 - 0.55 * difficulty; // later puzzles: closer distractors
  const along = [-1, 0.5, 1.6, 2.2, -0.5].map((k) => at(axis, p, SHOWN + k * (k === -1 ? 1 : drift)));
  const off: Oklch[] =
    axis === "hue"
      ? [{ ...answer, l: answer.l + 0.09 * drift }, { ...answer, l: answer.l - 0.09 * drift }, { ...answer, c: answer.c * (1 - 0.45 * drift) }]
      : axis === "lightness"
        ? [{ ...answer, h: wrap((answer.h ?? 0) + 30 * drift) }, { ...answer, h: wrap((answer.h ?? 0) - 30 * drift) }, { ...answer, c: answer.c + 0.05 * drift }]
        : [{ ...answer, l: answer.l + 0.08 * drift }, { ...answer, h: wrap((answer.h ?? 0) + 35 * drift) }, { ...answer, l: answer.l - 0.08 * drift }];
  return [...along, ...off];
}

function shuffle<T>(list: T[], rand: Rand): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Colors this close look the same; options must be further apart than this. */
const MIN_GAP = 3;

/**
 * One puzzle. `difficulty` 0 to 1 brings the wrong options closer. Tries
 * new random plans until every color fits in sRGB and the options are
 * clearly different.
 */
export function makePuzzle(axis: Axis, rand: Rand, difficulty = 0): Puzzle {
  for (let attempt = 0; attempt < 200; attempt++) {
    const p = plan(axis, rand);
    const seq = Array.from({ length: SHOWN + 1 }, (_, k) => at(axis, p, k));
    if (!seq.every(inGamut)) continue;
    const hexes = seq.map(toHex);
    if (new Set(hexes).size !== hexes.length) continue;
    const answer = hexes[SHOWN];
    const picked: string[] = [answer];
    for (const c of shuffle(candidates(axis, p, difficulty).filter(inGamut), rand)) {
      const hx = toHex(c);
      if (picked.every((o) => distance(o, hx) >= MIN_GAP)) picked.push(hx);
      if (picked.length === OPTIONS) break;
    }
    if (picked.length < OPTIONS) continue;
    return { axis, shown: hexes.slice(0, SHOWN), answer, options: shuffle(picked, rand) };
  }
  throw new Error(`Could not make a ${axis} puzzle`);
}

const AXES: Axis[] = ["hue", "lightness", "chroma"];

/** A round of puzzles, each axis equally often, getting harder as it goes. */
export function makeRound(seed: number, length = ROUND_LENGTH): Puzzle[] {
  const rand = seeded(seed);
  const axes = shuffle(Array.from({ length }, (_, i) => AXES[i % AXES.length]), rand);
  return axes.map((axis, i) => makePuzzle(axis, rand, length > 1 ? i / (length - 1) : 0));
}

/** Local calendar date as YYYY-MM-DD. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The same seed for everyone on a given date (FNV-1a of the date). */
export function dailySeed(date: string): number {
  let h = 0x811c9dc5;
  for (const ch of `huetype-daily-${date}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

export interface GuessStats {
  rounds: number;
  bestScore: number;
  bestStreak: number;
  /** Daily results by date, newest kept (up to 60). */
  daily: Record<string, number>;
}

export const EMPTY_STATS: GuessStats = { rounds: 0, bestScore: 0, bestStreak: 0, daily: {} };

export interface RoundResult {
  score: number;
  bestStreak: number;
  /** Set for the daily round. */
  date?: string;
}

/** Stats after a finished round. The first daily result of a date counts; replays do not. */
export function recordRound(stats: GuessStats, r: RoundResult): GuessStats {
  const daily = { ...stats.daily };
  if (r.date && daily[r.date] === undefined) {
    daily[r.date] = r.score;
    const keep = Object.keys(daily).sort().slice(-60);
    for (const k of Object.keys(daily)) if (!keep.includes(k)) delete daily[k];
  }
  return {
    rounds: stats.rounds + 1,
    bestScore: Math.max(stats.bestScore, r.score),
    bestStreak: Math.max(stats.bestStreak, r.bestStreak),
    daily,
  };
}

/** Days in a row, ending today or yesterday, with a daily result. */
export function dailyStreak(stats: GuessStats, date: string): number {
  const d = new Date(`${date}T12:00:00`);
  if (stats.daily[date] === undefined) d.setDate(d.getDate() - 1);
  let n = 0;
  while (stats.daily[today(d)] !== undefined) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function parseStats(raw: string | undefined): GuessStats {
  if (!raw) return EMPTY_STATS;
  try {
    const v = JSON.parse(raw) as Partial<GuessStats>;
    const daily: Record<string, number> = {};
    for (const [k, s] of Object.entries(v.daily ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof s === "number") daily[k] = s;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
    return { rounds: num(v.rounds), bestScore: num(v.bestScore), bestStreak: num(v.bestStreak), daily };
  } catch {
    return EMPTY_STATS;
  }
}

/** A short shareable line, e.g. "Huetype daily 2026-11-01: 812 / 1000". */
export function shareLine(score: number, length: number, date?: string): string {
  return `Huetype ${date ? `daily ${date}` : "practice"}: ${score} / ${length * 100}`;
}
