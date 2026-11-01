import { useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  cssUrl,
  fallbackFor,
  fontFamilyCss,
  googleFontsPage,
  importRule,
  linkTag,
  loadPreviewFont,
  previewWeight,
  styleCount,
  type FontFamily,
} from "../lib/fonts";
import { openExternal } from "../lib/open";
import { StarButton } from "./StarButton";

export const DEFAULT_TEXT = "The quick brown fox jumps over the lazy dog";

/** One family: name, facts, a live preview and copy actions. */
export function FontCard({
  font,
  text,
  size,
  weight,
  starred,
  onStar,
  onCopy,
  note,
  rankLabel,
  onPair,
  tag,
}: {
  font: FontFamily;
  text: string;
  size: number;
  weight: number;
  starred: boolean;
  onStar: () => void;
  onCopy: (text: string, what: string) => void;
  /** A line under the facts, e.g. why a curated font is in its collection. */
  note?: string;
  /** Shown before the name, e.g. "#3". */
  rankLabel?: string;
  /** Adds a "Pairings" action. */
  onPair?: () => void;
  /** A label after the name, e.g. how sure a font match is. */
  tag?: { label: string; tone: "pass" | "plain" | "muted"; title?: string };
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);
  const w = previewWeight(font, weight);

  // Fetch the font only once its card scrolls near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (visible) loadPreviewFont(font, w);
  }, [visible, font, w]);

  const wght = font.axes.find((a) => a.tag === "wght");
  const otherAxes = font.axes.filter((a) => a.tag !== "wght" && a.tag !== "ital").map((a) => a.tag);

  return (
    <li ref={ref} className="font-card">
      <div className="font-card-head">
        <strong>
          {rankLabel && <span className="font-rank">{rankLabel}</span>}
          {font.family}
          {tag && (
            <span className={`badge font-tag ${tag.tone}`} title={tag.title}>
              {tag.label}
            </span>
          )}
        </strong>
        <StarButton on={starred} onClick={onStar} />
      </div>
      <div className="font-card-meta">
        <span>{CATEGORIES.find((c) => c.id === font.category)?.label}</span>
        <span>
          {styleCount(font)} {styleCount(font) === 1 ? "style" : "styles"}
        </span>
        {wght && (
          <span className="badge" title={`Variable weight ${wght.min} to ${wght.max}${otherAxes.length ? `; also ${otherAxes.join(", ")}` : ""}`}>
            Variable{otherAxes.length ? ` +${otherAxes.length}` : ""}
          </span>
        )}
        {font.rank && !rankLabel && <span title="Popularity on Google Fonts">#{font.rank}</span>}
      </div>
      {note && <p className="font-note">{note}</p>}
      <p
        className="font-preview"
        style={{ fontFamily: visible ? `"${font.family}", ${fallbackFor(font.category)}` : undefined, fontSize: size, fontWeight: w }}
        lang="en"
      >
        {text || DEFAULT_TEXT}
      </p>
      <div className="font-card-actions">
        <button type="button" className="link-btn" onClick={() => onCopy(fontFamilyCss(font), `font-family for ${font.family}`)}>
          Copy CSS
        </button>
        <button type="button" className="link-btn" onClick={() => onCopy(linkTag(font), `<link> tags for ${font.family}`)}>
          Copy &lt;link&gt;
        </button>
        <button type="button" className="link-btn" onClick={() => onCopy(importRule(font), `@import for ${font.family}`)}>
          Copy @import
        </button>
        <button type="button" className="link-btn" onClick={() => void openExternal(googleFontsPage(font))} title={cssUrl(font)}>
          Google Fonts ↗
        </button>
        {onPair && (
          <button type="button" className="link-btn" onClick={onPair}>
            Pairings
          </button>
        )}
      </div>
    </li>
  );
}
