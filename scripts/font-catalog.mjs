// Builds src/data/google-fonts.json, the font catalog bundled with the app.
//
// Source: the Google Fonts Developer API response and variable-axes data as
// published in the google-font-metadata npm package (MIT), so no API key is
// needed to rebuild. Run: node scripts/font-catalog.mjs [version]
import { writeFileSync } from "node:fs";
import { loadMetadata } from "./gfm.mjs";

const meta = loadMetadata(process.argv[2] ?? "latest");
const pkg = { version: meta.version };
const api = meta.read("api-response.json");
const variable = meta.read("variable.json");

const axesByFamily = new Map(Object.values(variable).map((v) => [v.family, v.axes]));
/** Icon fonts are not text faces: leave them out of a type catalog. */
const isIconFont = (family) => /^Material (Icons|Symbols)/.test(family);

const families = api
  .filter((f) => !isIconFont(f.family))
  .map((f) => {
    const weights = [...new Set(f.variants.map((v) => (v === "regular" || v === "italic" ? 400 : parseInt(v, 10))))].sort((a, b) => a - b);
    const axes = axesByFamily.get(f.family);
    const entry = {
      f: f.family,
      c: f.category,
      w: weights,
      s: f.subsets,
      m: f.lastModified,
    };
    if (f.variants.some((v) => v.endsWith("italic"))) entry.i = 1;
    if (axes) entry.a = Object.entries(axes).map(([tag, a]) => `${tag}:${a.min}-${a.max}`).join(",");
    return entry;
  })
  .sort((a, b) => a.f.localeCompare(b.f));

const out = {
  source: `Google Fonts Developer API via google-font-metadata ${pkg.version}`,
  updated: families.reduce((m, f) => (f.m > m ? f.m : m), ""),
  families,
};
writeFileSync(new URL("../src/data/google-fonts.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`${families.length} families, newest ${out.updated}`);
