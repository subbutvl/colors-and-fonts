import { DEFAULT_TEXT } from "./FontCard";

/** Preview text and size, shared by the font list pages. */
export function FontPreviewControls({
  text,
  size,
  onText,
  onSize,
  placeholder = DEFAULT_TEXT,
}: {
  text: string;
  size: number;
  onText: (text: string) => void;
  onSize: (size: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="font-controls">
      <input className="text-input font-sample" placeholder={placeholder} value={text} onChange={(e) => onText(e.target.value)} aria-label="Preview text" maxLength={200} />
      <label className="inline-field">
        Size
        <input type="range" min={12} max={96} value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Preview size" />
        <span className="mono">{size}px</span>
      </label>
    </div>
  );
}
