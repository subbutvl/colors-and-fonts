import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { convert, copyText, parseColor } from "../lib/colors";
import { buildScales, GEN_FORMATS, generateCss, MAX_BRAND, roles, type BrandColor, type GenFormat, type GenValue, type Role } from "../lib/cssgen";
import { hueFamily } from "../lib/scale";
import type { Section } from "../sections";

interface Row {
  name: string;
  input: string;
}

const STORE_KEY = "huetype.cssgen";
const DEFAULT_ROWS: Row[] = [
  { name: "brand", input: "#5B6CFF" },
  { name: "accent", input: "#F2C94C" },
];

interface Saved {
  rows: Row[];
  neutral: boolean;
  format: GenFormat;
  value: GenValue;
}

function load(): Saved {
  const fallback: Saved = { rows: DEFAULT_ROWS, neutral: true, format: "css", value: "hex" };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      rows: Array.isArray(v.rows) && v.rows.length ? v.rows.slice(0, MAX_BRAND) : fallback.rows,
      neutral: v.neutral ?? true,
      format: GEN_FORMATS.some((f) => f.id === v.format) ? (v.format as GenFormat) : "css",
      value: v.value === "oklch" ? "oklch" : "hex",
    };
  } catch {
    return fallback;
  }
}

/** Light and dark mock-ups of the semantic roles. */
function RolePreview({ list, mode }: { list: Role[]; mode: "light" | "dark" }) {
  const r = (name: string) => list.find((x) => x.name === name)?.[mode] ?? "transparent";
  return (
    <div className="gen-preview" style={{ background: r("background"), color: r("foreground"), borderColor: r("border") }}>
      <small style={{ color: r("muted-foreground") }}>{mode === "light" ? "Light" : "Dark"}</small>
      <strong>Your product</strong>
      <span style={{ color: r("muted-foreground") }}>Semantic roles built from your colors.</span>
      <div className="gen-preview-row">
        <span className="gen-btn" style={{ background: r("primary"), color: r("primary-foreground") }}>
          Primary
        </span>
        <span className="gen-btn" style={{ background: r("secondary"), color: r("secondary-foreground") }}>
          Secondary
        </span>
        <span className="gen-btn" style={{ background: r("accent"), color: r("accent-foreground") }}>
          Accent
        </span>
      </div>
      <div className="gen-preview-card" style={{ background: r("muted"), borderColor: r("border") }}>
        <span style={{ color: r("muted-foreground") }}>Muted panel with a</span> <b style={{ color: r("primary") }}>primary link</b>
      </div>
    </div>
  );
}

/** CSS generator (10): brand colors in, scales and semantic roles out, in six formats. */
export function CssGeneratorPage({ section }: { section: Section }) {
  const initial = useMemo(load, []);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [neutral, setNeutral] = useState(initial.neutral);
  const [format, setFormat] = useState<GenFormat>(initial.format);
  const [value, setValue] = useState<GenValue>(initial.value);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ rows, neutral, format, value }));
    } catch {
      // ignore
    }
  }, [rows, neutral, format, value]);

  const parsed = rows.map((r) => {
    const c = parseColor(r.input);
    return c ? convert(c).hex : null;
  });
  const colors: BrandColor[] = rows.flatMap((r, i) => (parsed[i] ? [{ name: r.name.trim() || hueFamily(parsed[i]!), hex: parsed[i]! }] : []));
  const scales = useMemo(() => buildScales(colors, neutral), [JSON.stringify(colors), neutral]);
  const roleList = useMemo(() => roles(scales, neutral), [scales, neutral]);
  const output = useMemo(() => generateCss({ colors, neutral, format, value }), [JSON.stringify(colors), neutral, format, value]);

  const update = (i: number, change: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const remove = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  const add = () => setRows((rs) => (rs.length < MAX_BRAND ? [...rs, { name: "", input: "#1F9D55" }] : rs));

  const file = GEN_FORMATS.find((f) => f.id === format)!;
  const copy = () =>
    copyText(output)
      .then(() => setStatus(`Copied ${file.label} (${output.split("\n").length} lines). Paste it into ${file.file}.`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  return (
    <div className="page">
      <PageHead section={section} />

      <section className="settings-group">
        <h2>Your colors</h2>
        {rows.map((r, i) => (
          <div key={i} className="setting-row gen-row">
            <span className="gen-dot" style={{ background: parsed[i] ?? "transparent" }} aria-hidden="true" />
            <input
              className="text-input gen-name"
              value={r.name}
              placeholder={parsed[i] ? hueFamily(parsed[i]!) : "name"}
              onChange={(e) => update(i, { name: e.target.value })}
              aria-label={`Name of color ${i + 1}`}
              maxLength={30}
            />
            <input
              className="text-input mono-input gen-value"
              value={r.input}
              spellCheck={false}
              onChange={(e) => update(i, { input: e.target.value })}
              aria-label={`Value of color ${i + 1}`}
              aria-invalid={!parsed[i]}
            />
            <input
              type="color"
              className="native-color"
              value={parsed[i]?.toLowerCase() ?? "#000000"}
              onChange={(e) => update(i, { input: e.target.value.toUpperCase() })}
              aria-label={`Choose color ${i + 1}`}
            />
            <span className="help gen-role">{i === 0 ? "Primary" : i === 1 ? "Accent" : ""}</span>
            <button type="button" className="link-btn" onClick={() => remove(i)} disabled={rows.length <= 1}>
              Remove
            </button>
          </div>
        ))}
        <div className="setting-row">
          <button type="button" className="secondary-btn" onClick={add} disabled={rows.length >= MAX_BRAND}>
            Add color
          </button>
          <label className="inline-field">
            <input type="checkbox" className="switch" checked={neutral} onChange={(e) => setNeutral(e.target.checked)} />
            Add a neutral gray tinted with the primary
          </label>
        </div>
      </section>

      {scales.length > 0 && (
        <>
          <ul className="gen-scales">
            {scales.map((s) => (
              <li key={s.name}>
                <span className="mono">{s.name}</span>
                <span className="gen-scale-strip">
                  {s.steps.map((st) => (
                    <span key={st.step} style={{ background: st.hex }} title={`${s.name}-${st.step} ${st.hex}`} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="gen-previews">
            <RolePreview list={roleList} mode="light" />
            <RolePreview list={roleList} mode="dark" />
          </div>
        </>
      )}

      <section className="settings-group">
        <div className="gen-tabs" role="tablist" aria-label="Format">
          {GEN_FORMATS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={format === f.id} className={format === f.id ? "on" : ""} onClick={() => setFormat(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ct-fix-head">
          <span className="mono">{file.file}</span>
          <div className="conv-row">
            <div className="theme-switch gen-value-switch" role="group" aria-label="Values">
              {(["hex", "oklch"] as const).map((x) => (
                <button key={x} type="button" className={value === x ? "on" : ""} aria-pressed={value === x} onClick={() => setValue(x)}>
                  {x === "hex" ? "HEX" : "OKLCH"}
                </button>
              ))}
            </div>
            <button type="button" className="primary-btn" onClick={copy} disabled={!output}>
              Copy
            </button>
          </div>
        </div>
        <pre className="scale-code gen-code">{output || "Add a color to generate."}</pre>
      </section>

      <p className="help" role="status">
        {status ??
          (format === "material"
            ? "Material tones are exact CIELAB L* like HCT, with CIELCh hue and chroma as a stand-in. Second and third colors become secondary and tertiary."
            : "The first color is the primary; the second (if any) drives the accent role. Dark roles apply with the system dark mode or a .dark class.")}
      </p>
    </div>
  );
}
