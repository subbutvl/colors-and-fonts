import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PageHead } from "../components/PageHead";
import { copyText, FORMAT_LABELS, formatColor, getCopyFormat, nearestName, onCopyFormat, type ColorFormat } from "../lib/colors";
import { isTauri } from "../lib/env";
import { extract, MAX_K, MIN_K, type Pixels } from "../lib/imagePalette";
import { savePalette } from "../lib/palettes";
import { FRAME_HEADER } from "../lib/picker";
import type { Section } from "../sections";

/** Images are scaled down to this on their long side before sampling. */
const MAX_SIDE = 1200;

type Sort = "share" | "light";

interface Loaded {
  pixels: Pixels;
  source: string;
}

/** Draw any image source into a canvas no larger than MAX_SIDE and read its pixels. */
function toPixels(canvas: HTMLCanvasElement, src: CanvasImageSource, w: number, h: number): Pixels {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: img.data, width: img.width, height: img.height };
}

/** Image palette (11): the main colors of an image. */
export function ImagePalettePage({ section }: { section: Section }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [k, setK] = useState(6);
  const [sort, setSort] = useState<Sort>("share");
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    getCopyFormat().then(setFormat);
    return onCopyFormat(setFormat);
  }, []);

  const fromBlob = useCallback(async (blob: Blob, source: string) => {
    if (!blob.type.startsWith("image/")) {
      setStatus("That is not an image. Try PNG, JPEG, WebP, GIF or BMP.");
      return;
    }
    try {
      const bmp = await createImageBitmap(blob);
      setLoaded({ pixels: toPixels(canvas.current!, bmp, bmp.width, bmp.height), source });
      bmp.close();
      setStatus(null);
    } catch (e) {
      setStatus(`Could not read the image: ${e}`);
    }
  }, []);

  // Paste an image from anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void fromBlob(file, "Pasted image");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [fromBlob]);

  const grab = async () => {
    setBusy(true);
    setStatus("Grabbing the screen…");
    try {
      const buf = await invoke<ArrayBuffer>("grab_screen");
      const view = new DataView(buf);
      const w = view.getUint32(0, true);
      const h = view.getUint32(4, true);
      const frame = new ImageData(new Uint8ClampedArray(buf, FRAME_HEADER, w * h * 4), w, h);
      const bmp = await createImageBitmap(frame);
      setLoaded({ pixels: toPixels(canvas.current!, bmp, w, h), source: "Screen" });
      bmp.close();
      setStatus(null);
    } catch (e) {
      setStatus(`Could not grab the screen: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const colors = useMemo(() => {
    if (!loaded) return [];
    const list = extract(loaded.pixels, k);
    if (sort === "light") return [...list].sort((a, b) => lum(b.hex) - lum(a.hex));
    return list;
  }, [loaded, k, sort]);

  const copy = (text: string, what = text) =>
    copyText(text)
      .then(() => setStatus(`Copied ${what}`))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  const save = async () => {
    try {
      const name = loaded?.source === "Screen" ? "From screen" : (loaded?.source ?? "Image palette");
      await savePalette(name, colors.map((c) => c.hex));
      setStatus(`Saved "${name}" to Palettes.`);
    } catch (e) {
      setStatus(`Could not save: ${e}`);
    }
  };

  return (
    <div className="page">
      <PageHead section={section} />

      <div
        className={`img-drop${dragging ? " over" : ""}${loaded ? " has-image" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void fromBlob(file, file.name.replace(/\.[^.]+$/, ""));
        }}
      >
        <div className="img-stage" hidden={!loaded}>
          <canvas ref={canvas} className="img-canvas" />
          {loaded &&
            colors.map((c, i) => (
              <span
                key={i}
                className="img-marker"
                style={{ left: `${((c.x + 0.5) / loaded.pixels.width) * 100}%`, top: `${((c.y + 0.5) / loaded.pixels.height) * 100}%`, background: c.hex }}
                title={c.hex}
              />
            ))}
        </div>
        {!loaded && (
          <div className="img-empty">
            <strong>Drop an image here</strong>
            <span>or paste one with Ctrl+V, choose a file, or grab your screen.</span>
          </div>
        )}
        <div className="img-actions">
          <button type="button" className="secondary-btn" onClick={() => fileInput.current?.click()}>
            Choose image
          </button>
          {isTauri() && (
            <button type="button" className="secondary-btn" onClick={() => void grab()} disabled={busy}>
              Grab screen
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void fromBlob(file, file.name.replace(/\.[^.]+$/, ""));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {loaded && (
        <>
          <div className="toolbar-row">
            <div className="stepper" role="group" aria-label="Number of colors">
              <button type="button" onClick={() => setK((n) => Math.max(MIN_K, n - 1))} disabled={k <= MIN_K} aria-label="Fewer colors">
                −
              </button>
              <span>{k} colors</span>
              <button type="button" onClick={() => setK((n) => Math.min(MAX_K, n + 1))} disabled={k >= MAX_K} aria-label="More colors">
                +
              </button>
            </div>
            <div className="theme-switch" role="group" aria-label="Sort">
              <button type="button" className={sort === "share" ? "on" : ""} aria-pressed={sort === "share"} onClick={() => setSort("share")}>
                Most used
              </button>
              <button type="button" className={sort === "light" ? "on" : ""} aria-pressed={sort === "light"} onClick={() => setSort("light")}>
                Light to dark
              </button>
            </div>
            <button type="button" className="secondary-btn" onClick={() => copy(colors.map((c) => formatColor(c.hex, format)).join(", "), `${colors.length} colors`)}>
              Copy all
            </button>
            <button type="button" className="primary-btn" onClick={() => void save()}>
              Save as palette
            </button>
          </div>

          <ul className="img-colors">
            {colors.map((c, i) => {
              const value = formatColor(c.hex, format);
              return (
                <li key={i}>
                  <button type="button" className="img-color" onClick={() => copy(value)} title={`Copy ${FORMAT_LABELS[format]}`}>
                    <span className="img-sw" style={{ background: c.hex }} />
                    <span className="img-meta">
                      <code>{c.hex}</code>
                      <small>{nearestName(c.hex).name}</small>
                    </span>
                    <span className="img-share">
                      <span style={{ width: `${Math.max(2, c.share * 100)}%`, background: c.hex }} />
                      <small>{(c.share * 100).toFixed(c.share < 0.1 ? 1 : 0)}%</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="help" role="status">
        {status ??
          (loaded
            ? `${loaded.source}: colors grouped in OKLab, as people see them. Dots on the image mark a pixel of each color. Click a color to copy it as ${FORMAT_LABELS[format]}.`
            : "Images stay on this computer; nothing is uploaded.")}
      </p>
    </div>
  );
}

/** Relative luminance-ish ordering key (sRGB average weighted for the eye). */
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
