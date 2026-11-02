import { useState } from "react";
import { valueRows } from "../lib/colorDetails";
import { copyText, nearestName } from "../lib/colors";
import { ArrowIcon, CheckIcon, CopyIcon } from "../toolbar/icons";
import "./valueCard.css";

/**
 * The hover card for one picked color, shared by the floating toolbar and
 * the pick session bar (both always dark): HEX, RGB, RGBA, HSL and HSB with
 * copy, plus a link to the full Color details page.
 */
export function ValueCard({ hex, onDetails, children }: { hex: string; onDetails: () => void; children?: React.ReactNode }) {
  const [copied, setCopied] = useState<string | null>(null);
  const name = nearestName(hex);
  const copy = (text: string) => {
    copyText(text)
      .then(() => setCopied(text))
      .catch((e) => console.error("copy", e));
  };
  return (
    <div className="vc" role="dialog" aria-label={`Color ${hex}`}>
      <div className="vc-head">
        <span className="vc-chip" style={{ background: hex }} />
        <span className="vc-name">
          {name.deltaE < 1 ? "" : "≈ "}
          {name.name}
        </span>
        {children}
      </div>
      <ul className="vc-rows">
        {valueRows(hex).map((r) => (
          <li key={r.label}>
            <span className="vc-label">{r.label}</span>
            <code>{r.value.replace(/^[a-z]+\(|\)$/g, "")}</code>
            <button type="button" className="vc-btn" onClick={() => copy(r.value)} aria-label={`Copy ${r.label}`} title={`Copy ${r.value}`}>
              {copied === r.value ? <CheckIcon /> : <CopyIcon />}
            </button>
          </li>
        ))}
        <li>
          <span className="vc-link">Color details</span>
          <button type="button" className="vc-btn" onClick={onDetails} aria-label="Open color details" title="Tints, shades, harmonies and contrast">
            <ArrowIcon />
          </button>
        </li>
      </ul>
    </div>
  );
}
