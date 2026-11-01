import { useEffect, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { colorSwatchInk } from "../lib/colorInk";
import { contrast, copyText, FORMAT_LABELS, FORMATS, formatColor } from "../lib/colors";
import { byDecade, COTY_YEARS, cotyCss, cotyYear, LAST_YEAR, pantoneLabel, type CotyColor } from "../lib/pantone";
import type { Section } from "../sections";
import { useStarred } from "../useStarred";

const YEAR_KEY = "huetype.pantone.year";

function initialYear(): number {
  try {
    const y = Number(localStorage.getItem(YEAR_KEY));
    if (cotyYear(y)) return y;
  } catch {
    // ignore
  }
  return LAST_YEAR;
}


/** One color of the selected year: big swatch, values, contrast. */
function ColorDetail({ color, year, onCopy }: { color: CotyColor; year: number; onCopy: (text: string, what: string) => void }) {
  const { isStarred, toggle } = useStarred();
  const ink = colorSwatchInk(color.hex);
  const onWhite = contrast(color.hex, "#FFFFFF");
  const onBlack = contrast(color.hex, "#000000");
  return (
    <article className="coty-detail">
      <div className="coty-hero" style={{ background: color.hex, color: ink }}>
        <span className="coty-hero-year">{year}</span>
        <strong>{color.name}</strong>
        <span className="mono">PANTONE {color.code}</span>
      </div>
      <div className="coty-info">
        <div className="coty-info-head">
          <p>{color.note}</p>
          <StarButton on={isStarred(color.hex)} onClick={() => toggle(color.hex)} />
        </div>
        <dl className="coty-values">
          {FORMATS.map((f) => {
            const v = formatColor(color.hex, f);
            return (
              <div key={f}>
                <dt>{FORMAT_LABELS[f]}</dt>
                <dd>
                  <button type="button" className="link-btn mono" onClick={() => onCopy(v, `${FORMAT_LABELS[f]} of ${color.name}`)} title="Copy">
                    {v}
                  </button>
                </dd>
              </div>
            );
          })}
          <div>
            <dt>Pantone</dt>
            <dd>
              <button type="button" className="link-btn mono" onClick={() => onCopy(pantoneLabel(color), color.name)} title="Copy">
                {pantoneLabel(color)}
              </button>
            </dd>
          </div>
        </dl>
        <div className="coty-contrast">
          <span className="coty-chip" style={{ background: "#FFFFFF", color: color.hex }}>
            Aa on white <b>{onWhite.ratio.toFixed(2)}</b>
            <span className={`badge ${onWhite.level === "Fail" ? "fail" : "pass"}`}>{onWhite.level}</span>
          </span>
          <span className="coty-chip" style={{ background: "#000000", color: color.hex }}>
            Aa on black <b>{onBlack.ratio.toFixed(2)}</b>
            <span className={`badge ${onBlack.level === "Fail" ? "fail" : "pass"}`}>{onBlack.level}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

/** Pantone (4): every Color of the Year since 2002. */
export function PantonePage({ section }: { section: Section }) {
  const [year, setYear] = useState(initialYear);
  const [status, setStatus] = useState<string | null>(null);
  const selected = cotyYear(year)!;

  useEffect(() => {
    try {
      localStorage.setItem(YEAR_KEY, String(year));
    } catch {
      // ignore
    }
  }, [year]);

  const copy = (text: string, what: string) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  // Listbox keys: one tab stop; arrows, Home and End move the selection.
  const onStripKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const first = COTY_YEARS[0].year;
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? Math.max(first, year - 1)
        : e.key === "ArrowRight" || e.key === "ArrowDown"
          ? Math.min(LAST_YEAR, year + 1)
          : e.key === "Home"
            ? first
            : e.key === "End"
              ? LAST_YEAR
              : null;
    if (next === null) return;
    e.preventDefault();
    setYear(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-year="${next}"]`)?.focus();
  };

  const pick = (y: number) => {
    setYear(y);
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="coty-strip" role="listbox" aria-label="Years" aria-orientation="horizontal" onKeyDown={onStripKey}>
        {COTY_YEARS.map((y) => (
          <button
            key={y.year}
            type="button"
            role="option"
            aria-selected={y.year === year}
            tabIndex={y.year === year ? 0 : -1}
            data-year={y.year}
            className={`coty-strip-year${y.year === year ? " on" : ""}`}
            onClick={() => setYear(y.year)}
            title={`${y.year}: ${y.colors.map((c) => c.name).join(" and ")}`}
          >
            <span className="coty-strip-sw">
              {y.colors.map((c) => (
                <span key={c.code} style={{ background: c.hex }} />
              ))}
            </span>
            <small>{String(y.year).slice(2)}</small>
          </button>
        ))}
      </div>

      <div className="toolbar-row">
        <button type="button" className="secondary-btn" disabled={year <= COTY_YEARS[0].year} onClick={() => setYear(year - 1)}>
          ← {year - 1}
        </button>
        <button type="button" className="secondary-btn" disabled={year >= LAST_YEAR} onClick={() => setYear(year + 1)}>
          {year + 1} →
        </button>
        <span className="spacer" />
        <button type="button" className="secondary-btn" onClick={() => copy(cotyCss(), "all colors as CSS variables")}>
          Copy all as CSS variables
        </button>
      </div>
      <p className="help" role="status">
        {status ??
          (selected.colors.length > 1
            ? `${year} had two colors, chosen to be used together.`
            : "Click a value to copy it. Star a color to keep it in Saved.")}
      </p>

      <div className={`coty-selected${selected.colors.length > 1 ? " two" : ""}`}>
        {selected.colors.map((c) => (
          <ColorDetail key={c.code} color={c} year={year} onCopy={copy} />
        ))}
      </div>

      {byDecade().map((d) => (
        <section key={d.decade}>
          <h2 className="vision-h">
            {d.years[d.years.length - 1].year} to {d.years[0].year}
          </h2>
          <ul className="coty-grid">
            {d.years.map((y) => (
              <li key={y.year}>
                <button type="button" className={`coty-card${y.year === year ? " on" : ""}`} onClick={() => pick(y.year)}>
                  <span className="coty-card-sw">
                    {y.colors.map((c) => (
                      <span key={c.code} style={{ background: c.hex }} />
                    ))}
                  </span>
                  <span className="coty-card-text">
                    <b>{y.year}</b>
                    <span>{y.colors.map((c) => c.name).join(" + ")}</span>
                    <small className="mono">{y.colors.map((c) => c.code).join(" · ")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="note">
        Pantone and Color of the Year are trademarks of Pantone LLC. Huetype is not affiliated with Pantone. The screen values are common sRGB
        approximations of the printed colors; use a Pantone guide for print matching.
      </p>
    </div>
  );
}
