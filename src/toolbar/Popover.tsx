import { useState } from "react";
import { contrast, copyText, FORMAT_LABELS, FORMATS, formatColor, nearestName } from "../lib/colors";
import { useStarred } from "../useStarred";
import { CheckIcon, CloseIcon, CopyIcon, StarIcon } from "./icons";

/** Details for one picked color: every format with copy, nearest name, contrast. */
export function Popover({ hex, onClose }: { hex: string; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const { isStarred, toggle } = useStarred();
  const starred = isStarred(hex);
  const name = nearestName(hex);
  const onWhite = contrast(hex, "#FFFFFF");
  const onBlack = contrast(hex, "#000000");
  const copy = (text: string) => {
    copyText(text)
      .then(() => setCopied(text))
      .catch((e) => console.error("copy", e));
  };

  return (
    <div className="popover" role="dialog" aria-label={`Color ${hex}`}>
      <div className="pop-head" style={{ background: hex }}>
        <span className="pop-name" style={{ color: onBlack.ratio > onWhite.ratio ? "#000" : "#fff" }}>
          {hex}
        </span>
        <span className="pop-head-tools">
          <button
            type="button"
            className={`pop-close pop-star${starred ? " on" : ""}`}
            onClick={() => toggle(hex)}
            aria-pressed={starred}
            aria-label={starred ? "Remove from Saved" : "Save to Saved"}
            title={starred ? "Starred: click to remove from Saved" : "Star: keep it in Saved"}
          >
            <StarIcon filled={starred} />
          </button>
          <button type="button" className="pop-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </span>
      </div>
      <ul className="pop-formats">
        {FORMATS.map((f) => {
          const text = formatColor(hex, f);
          return (
            <li key={f}>
              <span className="pop-label">{FORMAT_LABELS[f]}</span>
              <code>{text}</code>
              <button type="button" className="pop-copy" onClick={() => copy(text)} aria-label={`Copy ${FORMAT_LABELS[f]}`}>
                {copied === text ? <CheckIcon /> : <CopyIcon />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="pop-meta">
        <span title={`CSS color keyword, ΔE ${name.deltaE.toFixed(1)}`}>
          <span className="pop-chip" style={{ background: name.hex }} />
          {name.deltaE < 1 ? "" : "≈ "}
          {name.name}
        </span>
        <span className="pop-contrast">
          <span className="pop-chip ink" style={{ background: "#fff", color: hex }}>
            A
          </span>
          {onWhite.ratio.toFixed(2)} <b className={onWhite.level === "Fail" ? "fail" : ""}>{onWhite.level}</b>
          <span className="pop-chip ink" style={{ background: "#000", color: hex }}>
            A
          </span>
          {onBlack.ratio.toFixed(2)} <b className={onBlack.level === "Fail" ? "fail" : ""}>{onBlack.level}</b>
        </span>
      </div>
    </div>
  );
}
