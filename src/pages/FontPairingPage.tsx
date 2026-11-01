import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { copyText } from "../lib/colors";
import { CATEGORIES, fallbackFor, loadPreviewFont, previewWeight, WEIGHT_NAMES, type FontFamily } from "../lib/fonts";
import { byFamily, PAIR_KEY, pairCss, PAIRS, suggestBodies } from "../lib/fontSets";
import type { Section } from "../sections";
import { useFontCatalog } from "../useFontCatalog";
import { useStarredFonts } from "../useStarredFonts";

const LAST_KEY = "huetype.pairing.last";
const stack = (f: FontFamily) => `"${f.family}", ${fallbackFor(f.category)}`;

interface Choice {
  heading: string;
  body: string | null;
}

/** Where to start: a family sent from another page, else the last pair. */
function initialChoice(): Choice {
  try {
    const sent = localStorage.getItem(PAIR_KEY);
    if (sent) {
      localStorage.removeItem(PAIR_KEY);
      return { heading: sent, body: null };
    }
    const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as Choice | null;
    if (last?.heading) return last;
  } catch {
    // ignore
  }
  return { heading: "Playfair Display", body: null };
}

/** The pair laid out as a short article. */
function SamplePage({ heading, body, headingWeight, base }: { heading: FontFamily; body: FontFamily; headingWeight: number; base: number }) {
  return (
    <article className="pair-sample" style={{ fontFamily: stack(body), fontSize: base }}>
      <small className="pair-kicker" style={{ fontFamily: stack(body) }}>
        Field notes · 6 min read
      </small>
      <h1 style={{ fontFamily: stack(heading), fontWeight: headingWeight }}>The color of late afternoon light</h1>
      <p className="pair-lede">
        Designers have chased that warm, low sun for centuries. Here is what it does to type, and why the right pair of fonts makes a page feel calm.
      </p>
      <h2 style={{ fontFamily: stack(heading), fontWeight: headingWeight }}>Contrast, not conflict</h2>
      <p>
        A good pairing gives each font one job. The heading sets the tone and is read in a glance; the body text carries the reading and should disappear
        into it. Pick faces that differ in <em>structure</em> rather than mood, and keep sizes clearly apart: <strong>about 1.5 to 2 times</strong> between
        body and title is a safe start.
      </p>
      <p>
        Numbers matter too: 1,284 readers, 37% faster, 09:41. If the body face has tabular figures and a real italic, tables and quotes will look right
        without extra work.
      </p>
    </article>
  );
}

/** Font pairing (17): pick a heading font, get body fonts, preview them as a page. */
export function FontPairingPage({ section }: { section: Section }) {
  const { catalog, error } = useFontCatalog();
  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [input, setInput] = useState(choice.heading);
  const [weight, setWeight] = useState(700);
  const [base, setBase] = useState(17);
  const [status, setStatus] = useState<string | null>(null);
  const { isStarred, toggle } = useStarredFonts();

  const map = useMemo(() => (catalog ? byFamily(catalog.families) : null), [catalog]);
  const heading = map?.get(choice.heading) ?? null;
  const suggestions = useMemo(() => (heading && catalog ? suggestBodies(heading, catalog.families) : []), [heading, catalog]);
  const body = (choice.body && map?.get(choice.body)) || suggestions[0]?.body || null;
  const hw = heading ? previewWeight(heading, weight) : 400;

  useEffect(() => {
    try {
      if (heading) localStorage.setItem(LAST_KEY, JSON.stringify({ heading: choice.heading, body: body?.family ?? null }));
    } catch {
      // ignore
    }
  }, [heading, choice.heading, body]);

  // Fonts for the sample, the suggestion list and the curated gallery.
  useEffect(() => {
    if (heading) loadPreviewFont(heading, hw);
  }, [heading, hw]);
  useEffect(() => {
    if (!body) return;
    loadPreviewFont(body, previewWeight(body, 400));
    loadPreviewFont(body, previewWeight(body, 700));
  }, [body]);
  useEffect(() => {
    for (const s of suggestions) loadPreviewFont(s.body, previewWeight(s.body, 400));
  }, [suggestions]);
  useEffect(() => {
    if (!map) return;
    for (const p of PAIRS) {
      const h = map.get(p.heading);
      const b = map.get(p.body);
      if (h) loadPreviewFont(h, previewWeight(h, 700));
      if (b) loadPreviewFont(b, previewWeight(b, 400));
    }
  }, [map]);

  const pickHeading = (name: string) => {
    setInput(name);
    if (map?.has(name)) setChoice({ heading: name, body: null });
  };

  const copy = (value: string, what: string) =>
    copyText(value)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const inputKnown = !!map?.has(input);

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="toolbar-row">
        <label className="inline-field">
          Heading font
          <input
            className="text-input"
            list="pair-families"
            value={input}
            onChange={(e) => pickHeading(e.target.value)}
            aria-invalid={!!map && !inputKnown}
            spellCheck={false}
          />
          <datalist id="pair-families">
            {catalog?.families.map((f) => (
              <option key={f.family} value={f.family} />
            ))}
          </datalist>
        </label>
        <label className="inline-field">
          Weight
          <select value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
            {[400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w} {WEIGHT_NAMES[w]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          Text size
          <input type="range" min={14} max={22} value={base} onChange={(e) => setBase(Number(e.target.value))} />
          <span className="mono">{base}px</span>
        </label>
        {heading && body && (
          <>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setChoice({ heading: body.family, body: heading.family });
                setInput(body.family);
              }}
              title="Use the body font for headings and the other way round"
            >
              Swap
            </button>
            <button type="button" className="primary-btn" onClick={() => copy(pairCss(heading, body), `CSS for ${heading.family} + ${body.family}`)}>
              Copy CSS
            </button>
          </>
        )}
      </div>

      <p className="help" role="status">
        {error ??
          status ??
          (map && !inputKnown
            ? "Type or choose a Google Fonts family for the headings."
            : "Pick a body font on the left; the page on the right shows the pair. Curated pairs come first, then picks by contrast.")}
      </p>

      {heading && (
        <div className="pair-layout">
          <ul className="pair-suggest" aria-label="Body fonts">
            {suggestions.map((s) => (
              <li key={s.body.family}>
                <button type="button" className={`pair-option${body?.family === s.body.family ? " on" : ""}`} aria-pressed={body?.family === s.body.family} onClick={() => setChoice({ heading: heading.family, body: s.body.family })}>
                  <span className="pair-option-name" style={{ fontFamily: stack(s.body) }}>
                    {s.body.family}
                  </span>
                  <span className="pair-option-meta">
                    {CATEGORIES.find((c) => c.id === s.body.category)?.label}
                    {s.pair && <span className="badge">Curated · {s.pair.style}</span>}
                  </span>
                  <span className="pair-option-why">{s.reason}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="pair-preview">
            {body && <SamplePage heading={heading} body={body} headingWeight={hw} base={base} />}
            {body && (
              <div className="pair-preview-foot">
                <span>
                  <b>{heading.family}</b> {hw} for headings, <b>{body.family}</b> for text
                </span>
                <span className="pair-stars">
                  <StarButton on={isStarred(heading.family)} onClick={() => toggle(heading.family)} />
                  {body.family !== heading.family && <StarButton on={isStarred(body.family)} onClick={() => toggle(body.family)} />}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <h2 className="vision-h">Curated pairs</h2>
      <ul className="pair-gallery">
        {map &&
          PAIRS.flatMap((p) => {
            const h = map.get(p.heading);
            const b = map.get(p.body);
            if (!h || !b) return [];
            const on = heading?.family === h.family && body?.family === b.family;
            return [
              <li key={`${p.heading}/${p.body}`}>
                <button
                  type="button"
                  className={`pair-tile${on ? " on" : ""}`}
                  onClick={() => {
                    setChoice({ heading: h.family, body: b.family });
                    setInput(h.family);
                    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <small>{p.style}</small>
                  <strong style={{ fontFamily: stack(h), fontWeight: previewWeight(h, 700) }}>{p.heading}</strong>
                  <span style={{ fontFamily: stack(b) }}>
                    {p.body === p.heading ? "Same family for text" : `${p.body} for text`}. {p.why}
                  </span>
                </button>
              </li>,
            ];
          })}
      </ul>
    </div>
  );
}
