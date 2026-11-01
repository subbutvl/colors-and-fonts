// Builds public/font-index.bin, the offline font matching index: every
// Latin Google Fonts family (regular, plus bold for the popular ones),
// rendered letter by letter and reduced to the features in
// src/lib/glyphFeatures.ts. The app compares letters cut from a screen
// capture against it; no font files ship with the app.
//
// Font URLs come from google-font-metadata (same version as the catalog);
// files are the Latin subsets on fonts.gstatic.com, cached between runs.
// Run: npm run fonts:index [-- --cache <dir>] [--only "Family,Family"]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import opentype from "opentype.js";
import { CHARSET, XHEIGHT_CHARS, encodeIndex, glyphFeature, inkBox, inkSize, median } from "../src/lib/glyphFeatures.ts";
import { loadMetadata } from "./gfm.mjs";
import { rasterize } from "./raster.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const cacheDir = arg("--cache") ?? join(tmpdir(), "huetype-font-files");
const only = arg("--only")?.split(",").map((s) => s.trim());
mkdirSync(cacheDir, { recursive: true });

const data = (file) => JSON.parse(readFileSync(new URL(`../src/data/${file}`, import.meta.url), "utf8"));
const catalog = data("google-fonts.json");
const version = catalog.source.match(/google-font-metadata ([\w.-]+)/)?.[1] ?? "latest";
const meta = loadMetadata(version);
const byFamily = new Map(Object.values(meta.read("google-fonts-v2.json")).map((f) => [f.family, f]));

// Families people use most also get a bold entry.
const popular = new Set([
  ...data("top-fonts.json").families,
  ...data("curated-fonts.json").collections.flatMap((c) => c.fonts.map((f) => f.family)),
  ...data("font-pairs.json").pairs.flatMap((p) => [p.heading, p.body]),
  ...data("font-pairs.json").body,
]);

// Noto families for other scripts reuse Noto Sans or Serif for their Latin letters.
const NOTO_LATIN = /^Noto (Sans|Serif)( Display| Mono)?$/;
const skip = (family) => /^Noto (Sans|Serif|Kufi|Naskh|Nastaliq|Rashi|Music|Znamenny|Traditional|Color|Emoji)/.test(family) && !NOTO_LATIN.test(family);

function latinUrl(meta, weight) {
  return meta.variants[String(weight)]?.normal?.latin?.url?.truetype;
}

/** Regular (or the weight nearest 400), plus 700 for popular families. */
function targets(family, m) {
  const weights = Object.keys(m.variants)
    .filter((w) => latinUrl(m, w))
    .map(Number)
    .sort((a, b) => Math.abs(a - 400) - Math.abs(b - 400) || a - b);
  if (!weights.length) return [];
  const out = [weights[0]];
  if (popular.has(family) && weights.includes(700) && weights[0] !== 700) out.push(700);
  return out;
}

async function fetchFont(url) {
  const file = join(cacheDir, createHash("sha1").update(url).digest("hex") + ".ttf");
  if (existsSync(file)) return readFileSync(file);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      return buf;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** Letter features of one font file, or null when it has too few Latin letters. */
function features(buf) {
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const xUnits = font.tables.os2?.sxHeight || font.unitsPerEm / 2;
  const size = (48 * font.unitsPerEm) / xUnits; // x-height about 48 px
  const rendered = [...CHARSET].map((c) => {
    if (!font.charToGlyphIndex(c)) return null;
    const ink = rasterize(font.charToGlyph(c).getPath(0, 0, size));
    const box = ink && inkBox(ink);
    return box ? { ink, box } : null;
  });
  const xh = median(
    [...XHEIGHT_CHARS].flatMap((c) => {
      const r = rendered[CHARSET.indexOf(c)];
      return r ? [inkSize(r.ink, r.box).height] : [];
    }),
  );
  if (!(xh > 0) || rendered.filter(Boolean).length < CHARSET.length / 2) return null;
  return rendered.map((r) => (r ? glyphFeature(r.ink, r.box, xh) : null));
}

const jobs = catalog.families
  .filter((f) => (only ? only.includes(f.f) : f.s.includes("latin") && !skip(f.f)))
  .flatMap((f) => {
    const m = byFamily.get(f.f);
    return m ? targets(f.f, m).map((weight) => ({ family: f.f, weight, url: latinUrl(m, weight) })) : [];
  });

console.log(`${jobs.length} fonts to index (cache ${cacheDir})`);
const entries = new Array(jobs.length);
const failed = [];
let next = 0;
let done = 0;
async function worker() {
  while (next < jobs.length) {
    const i = next++;
    const job = jobs[i];
    try {
      const glyphs = features(await fetchFont(job.url));
      if (glyphs) entries[i] = { family: job.family, weight: job.weight, glyphs };
      else failed.push(`${job.family} ${job.weight}: too few Latin letters`);
    } catch (e) {
      failed.push(`${job.family} ${job.weight}: ${e.message}`);
    }
    if (++done % 100 === 0) console.log(`${done} / ${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));

// Drop exact duplicates (families that share their Latin letters), and
// remember them so a match can name the families it stands for.
const firstByKey = new Map();
const aliases = {};
const kept = entries.filter((e) => {
  if (!e) return false;
  const key = createHash("sha1").update(encodeIndex([{ ...e, family: "" }])).digest("hex");
  const first = firstByKey.get(key);
  if (first) {
    if (first !== e.family) (aliases[first] ??= []).push(e.family);
    return false;
  }
  firstByKey.set(key, e.family);
  return true;
});
for (const list of Object.values(aliases)) list.splice(0, list.length, ...new Set(list));
writeFileSync(new URL("../src/data/font-index-aliases.json", import.meta.url), JSON.stringify(aliases, null, 1) + "\n");

const out = encodeIndex(kept);
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/font-index.bin", import.meta.url), out);
console.log(`${kept.length} entries, ${(out.length / 1e6).toFixed(2)} MB; ${entries.filter(Boolean).length - kept.length} duplicates dropped`);
if (failed.length) console.log(`Skipped ${failed.length}:\n  ${failed.join("\n  ")}`);
