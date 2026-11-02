import { useEffect, useMemo, useState } from "react";
import { StarButton } from "../components/StarButton";
import { colorRoute, describe, harmonies, mixSteps, seedContrast, seedPairing, seedPalette, seedScales, valueRows } from "../lib/colorDetails";
import { colorSwatchInk } from "../lib/colorInk";
import { contrast, copyText, formatColor, parseColor } from "../lib/colors";
import { formatHex } from "culori";
import { recentPicks } from "../lib/history";
import { useCopyFormat } from "../useCopyFormat";
import { useStarred } from "../useStarred";

const go = (section: string) => {
  window.location.hash = `/${section}`;
};

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

/** A row of swatches; click copies in the app copy format. */
function Strip({ colors, onCopy, label }: { colors: string[]; onCopy: (hex: string) => void; label: string }) {
  return (
    <ul className="cd-strip" aria-label={label}>
      {colors.map((c, i) => (
        <li key={`${c}-${i}`}>
          <button type="button" className="cd-strip-sw" style={{ background: c }} onClick={() => onCopy(c)} title={`Copy ${c}`} aria-label={`Copy ${c}`} />
          <span className="mono">{c}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Color details (opened from a picked color in the toolbar, the pick
 * session bar or Picker home): every value with copy, contrast at a glance,
 * a short description, tints, shades, harmonies and next steps.
 */
export function ColorPage({ hex: routeHex }: { hex: string | null }) {
  const [hex, setHex] = useState<string | null>(routeHex);
  const [input, setInput] = useState(routeHex ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const format = useCopyFormat();
  const { isStarred, toggle } = useStarred();

  // Follow the route; without one, show the latest pick.
  useEffect(() => {
    if (routeHex) {
      setHex(routeHex);
      setInput(routeHex);
      setStatus(null);
      return;
    }
    recentPicks(1)
      .then((rows) => {
        const h = rows[0]?.hex ?? "#5B6CFF";
        setHex(h);
        setInput(h);
      })
      .catch(() => setHex("#5B6CFF"));
  }, [routeHex]);

  const info = useMemo(() => (hex ? describe(hex) : null), [hex]);
  if (!hex || !info) return <div className="page" />;

  const copy = (text: string, what = text) => {
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Could not copy: ${e}`));
  };
  const copySwatch = (c: string) => copy(formatColor(c, format));
  const open = () => {
    const c = parseColor(input);
    const h = c ? formatHex(c)?.toUpperCase() : undefined;
    if (!h) return setStatus("Enter a color, such as #5B6CFF or rgb(91, 108, 255)");
    go(colorRoute(h));
  };

  const ink = colorSwatchInk(hex);
  const white = contrast("#FFFFFF", hex);
  const black = contrast("#000000", hex);
  const tints = mixSteps(hex, "white");
  const shades = mixSteps(hex, "black");
  const title = `${info.exact ? "" : "≈ "}${info.name}`;

  return (
    <div className="page cd-page">
      <div className="cd-top">
        <nav className="cd-crumbs" aria-label="Breadcrumb">
          <button type="button" className="link-btn" onClick={() => go("picker")}>
            Picker
          </button>
          <span aria-hidden="true">/</span>
          <span>{hex}</span>
        </nav>
        <form
          className="cd-search"
          onSubmit={(e) => {
            e.preventDefault();
            open();
          }}
        >
          <input className="text-input" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Color to show" placeholder="#5B6CFF" />
          <button type="submit" className="secondary-btn">
            Show
          </button>
        </form>
      </div>

      <div className="cd-hero">
        <div className="cd-swatch" style={{ background: hex, color: ink }}>
          <div className="cd-tags">
            {[info.hue, info.tone, info.vividness].map((t) => (
              <span key={t} className="cd-tag" style={{ borderColor: ink }}>
                {t}
              </span>
            ))}
          </div>
          <StarButton className="cd-star" on={isStarred(hex)} onClick={() => toggle(hex)} />
          <h1 className="cd-name">{title}</h1>
          <span className="cd-hex mono">{hex}</span>
        </div>

        <div className="cd-values">
          {valueRows(hex, "full").map((r) => (
            <div key={r.label} className="cd-value">
              <span className="cd-label">{r.label}</span>
              <code>{r.value}</code>
              <button type="button" className="cd-copy" onClick={() => copy(r.value, r.label)} aria-label={`Copy ${r.label}`} title={`Copy ${r.label}`}>
                <CopyIcon />
              </button>
            </div>
          ))}
          <div className="cd-contrast">
            <span className="cd-label">Contrast at a glance</span>
            {[
              { name: "White text", fg: "#FFFFFF", c: white },
              { name: "Black text", fg: "#000000", c: black },
            ].map(({ name, fg, c }) => (
              <div key={name} className="cd-contrast-row">
                <span className="cd-aa" style={{ background: hex, color: fg }}>
                  Aa
                </span>
                <span>{name}</span>
                <span className="mono">{c.ratio.toFixed(2)}:1</span>
                <b className={`cd-level${c.level === "Fail" ? " fail" : ""}`}>{c.level === "Fail" ? "Fails" : c.level}</b>
              </div>
            ))}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                seedContrast(hex);
                go("contrast");
              }}
            >
              Open the contrast checker →
            </button>
          </div>
        </div>
      </div>

      <p className="help" role="status">
        {status ?? `Click any swatch to copy it as ${format.toUpperCase()}.`}
      </p>

      <section className="cd-section">
        <h2>About {hex}</h2>
        <p className="cd-about">{info.about}</p>
      </section>

      <section className="cd-section">
        <div className="cd-head">
          <h2>Tints</h2>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              seedScales(hex);
              go("scales");
            }}
          >
            Open in Scales →
          </button>
        </div>
        <Strip colors={tints} onCopy={copySwatch} label="Tints" />
      </section>

      <section className="cd-section">
        <div className="cd-head">
          <h2>Shades</h2>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              seedScales(hex);
              go("scales");
            }}
          >
            Open in Scales →
          </button>
        </div>
        <Strip colors={shades} onCopy={copySwatch} label="Shades" />
      </section>

      <section className="cd-section">
        <div className="cd-head">
          <h2>Harmonies</h2>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              seedPairing(hex);
              go("color-pairing");
            }}
          >
            Open in Color pairing →
          </button>
        </div>
        <div className="cd-harmonies">
          {harmonies(hex).map((h) => (
            <div key={h.id} className="cd-harmony">
              <div className="cd-harmony-sw">
                {h.colors.map((c, i) => (
                  <button key={`${c}-${i}`} type="button" style={{ background: c }} onClick={() => copySwatch(c)} title={`Copy ${c}`} aria-label={`Copy ${c}`} />
                ))}
              </div>
              <strong>{h.label}</strong>
              <span className="mono">{h.colors.join(" · ")}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="cd-more">
        <div>
          <strong>Do more with {hex}</strong>
          <span>Build a palette around it, generate a scale, or check it for accessibility.</span>
        </div>
        <div className="cd-more-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              seedPalette(hex);
              go("palettes");
            }}
          >
            Start a palette
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              seedScales(hex);
              go("scales");
            }}
          >
            Generate a scale
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              seedContrast(hex);
              go("contrast");
            }}
          >
            Check contrast
          </button>
        </div>
      </section>
    </div>
  );
}
